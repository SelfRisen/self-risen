import { Injectable, Logger } from '@nestjs/common';
import { config, BaseService } from 'src/common';
import OpenAI from 'openai';
import { TokenUsageService } from 'src/user/token-usage.service';
import { OMNI_CBT_V6_4_PROMPT } from '../prompts/omni-cbt-v6_4.prompt';

export type OmniCbtRiskType =
  | 'none'
  | 'self_harm'
  | 'harm_to_others'
  | 'abuse'
  | 'immediate_danger'
  | 'psychosis_or_reality_testing'
  | 'eating_disorder_risk';

export type OmniCbtRiskLevel = 'none' | 'unclear' | 'elevated' | 'imminent';

export type OmniCbtInputType =
  | 'personal_belief'
  | 'mental_health_education'
  | 'unrelated'
  | 'gibberish'
  | 'safety';

export type OmniCbtIntensity = 'High' | 'Medium' | 'Low';

export type OmniCbtSupportType =
  | 'reframe'
  | 'validation'
  | 'celebration'
  | 'grounding'
  | 'safety'
  | 'fallback';

export type OmniCbtConfidence = 'High' | 'Medium' | 'Low';

export interface OmniCbtResponse {
  isSafetyIssue: boolean;
  isThirdPartyConcern: boolean;
  riskType: OmniCbtRiskType;
  riskLevel: OmniCbtRiskLevel;
  isPersonalBelief: boolean;
  inputType: OmniCbtInputType;
  intensity: OmniCbtIntensity;
  detectedDistortion: string | null;
  primaryEmotion: string;
  supportType: OmniCbtSupportType;
  userContext: string;
  reflectiveSummary: string;
  generatedAffirmation: string | null;
  socraticPivot: string | null;
  confidence: OmniCbtConfidence;
}

export type TransformBeliefResult = {
  limitingBelief: string;
  generatedAffirmation: string;
  omni?: OmniCbtResponse;
};

@Injectable()
export class NlpTransformationService extends BaseService {
  private readonly logger = new Logger(NlpTransformationService.name);
  private openai: OpenAI | null = null;
  private readonly systemPrompt = OMNI_CBT_V6_4_PROMPT;

  constructor(private tokenUsageService: TokenUsageService) {
    super();
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
    if (config.NODE_ENV === 'development') {
      this.logger.log('OpenAI client initialized for NLP transformation');
    }
  }

  /**
   * Transform limiting belief into empowering affirmation using OpenAI
   *
   * @param beliefText - The user's raw belief text
   * @param userId - The user's database ID for token tracking
   * @returns Object containing limiting belief and generated affirmation
   */
  async transformBelief(
    beliefText: string,
    userId?: string,
  ): Promise<TransformBeliefResult> {
    if (!this.openai) {
      if (config.NODE_ENV === 'development') {
        this.logger.warn(
          'OpenAI not configured. Returning placeholder transformation.',
        );
      }
      return this.getPlaceholderTransformation(beliefText);
    }

    if (!beliefText || beliefText.trim().length === 0) {
      if (config.NODE_ENV === 'development') {
        this.logger.warn('Empty belief text provided. Returning placeholder.');
      }
      return this.getPlaceholderTransformation(beliefText);
    }

    const maxResponseTokens = 500;
    const estimatedTokens = this.estimateTokens(beliefText, maxResponseTokens);
    if (userId) {
      try {
        await this.tokenUsageService.checkTokenLimit(userId, estimatedTokens);
      } catch (error) {
        if (config.NODE_ENV === 'development') {
          this.logger.warn(
            `Token limit check failed for user ${userId}: ${error.message}`,
          );
        }
        throw error;
      }
    }

    const timeoutMs = config.OPENAI_REQUEST_TIMEOUT_MS;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      if (config.NODE_ENV === 'development') {
        this.logger.log(
          `Starting NLP transformation for belief: ${beliefText.substring(0, 50)}...`,
        );
      }

      const model = config.OPENAI_NLP_MODEL || 'gpt-3.5-turbo';

      const response = await this.openai.chat.completions.create(
        {
          model: model,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: beliefText },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
          max_tokens: maxResponseTokens,
        },
        { signal: abortController.signal },
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      if (userId && response.usage) {
        const totalTokens = response.usage.total_tokens ?? estimatedTokens;
        await this.tokenUsageService.trackTokenUsage(userId, totalTokens);
        if (config.NODE_ENV === 'development') {
          this.logger.log(`Tracked ${totalTokens} tokens for user ${userId}`);
          const diff = Math.abs(totalTokens - estimatedTokens);
          if (diff > estimatedTokens * 0.2) {
            this.logger.log(
              `Token estimate vs actual: estimated=${estimatedTokens}, actual=${totalTokens}`,
            );
          }
        }
      }

      // Parse JSON response
      let parsedResponse: OmniCbtResponse;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        this.logger.error(
          `Failed to parse OpenAI JSON response: ${parseError.message}`,
        );
        throw new Error('Invalid JSON response from OpenAI');
      }

      // Sanitize and validate
      const limitingBelief = this.sanitizeText(beliefText);
      const generatedAffirmation = this.sanitizeText(
        parsedResponse.generatedAffirmation ?? '',
      );

      // Validate response structure (minimum required for downstream app flow)
      if (
        typeof parsedResponse?.isSafetyIssue !== 'boolean' ||
        typeof parsedResponse?.reflectiveSummary !== 'string' ||
        (typeof parsedResponse?.generatedAffirmation !== 'string' &&
          parsedResponse?.generatedAffirmation !== null)
      ) {
        throw new Error('Missing required fields in OpenAI response');
      }

      // Non-safety flows must provide a usable affirmation for the existing app contract.
      if (!parsedResponse.isSafetyIssue) {
        if (generatedAffirmation.length === 0) {
          throw new Error('Empty generatedAffirmation after sanitization');
        }
      }

      if (
        generatedAffirmation.length > 500 &&
        config.NODE_ENV === 'development'
      ) {
        this.logger.warn(
          `Generated affirmation is very long (${generatedAffirmation.length} chars), truncating`,
        );
      }

      if (config.NODE_ENV === 'development') {
        this.logger.log(
          `NLP transformation completed successfully. Affirmation length: ${generatedAffirmation.length} chars`,
        );
      }

      return {
        limitingBelief,
        generatedAffirmation,
        omni: parsedResponse,
      };
    } catch (error) {
      this.logger.error(
        `Error in NLP transformation: ${error.message}`,
        error.stack,
      );
      if (config.NODE_ENV === 'development') {
        this.logger.warn(
          'Falling back to placeholder transformation due to error',
        );
      }
      return this.getPlaceholderTransformation(beliefText);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sanitize text by removing markdown, extra whitespace, and formatting
   */
  private sanitizeText(text: string): string {
    if (!text) return '';

    return text
      .trim()
      .replace(/\*\*/g, '') // Remove markdown bold
      .replace(/\*/g, '') // Remove markdown italic
      .replace(/#{1,6}\s/g, '') // Remove markdown headers
      .replace(/\n{2,}/g, '\n') // Replace multiple newlines with single
      .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single
      .trim();
  }

  /**
   * Estimate token count for a given text with an explicit cap for response tokens.
   * Rough estimation: ~4 characters per token for English text.
   * @param text - User belief text
   * @param maxResponseTokens - Same as max_tokens sent to the API (default 500)
   */
  private estimateTokens(
    text: string,
    maxResponseTokens: number = 500,
  ): number {
    const systemPromptTokens = Math.ceil(this.systemPrompt.length / 4);
    const userTextTokens = Math.ceil(text.length / 4);
    return Math.ceil(
      (systemPromptTokens + userTextTokens + maxResponseTokens) * 1.1,
    );
  }

  /**
   * Get placeholder transformation when OpenAI is unavailable or fails
   */
  private getPlaceholderTransformation(
    beliefText: string,
  ): TransformBeliefResult {
    const limitingBelief = beliefText || 'Belief pattern not identified';
    const generatedAffirmation =
      'I am transforming my relationship with this belief. I choose to see new possibilities and create positive change in my life.';

    return {
      limitingBelief,
      generatedAffirmation,
    };
  }
}
