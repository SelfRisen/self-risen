import { Injectable, Logger } from '@nestjs/common';
import { config, BaseService } from 'src/common';
import OpenAI from 'openai';
import { TokenUsageService } from 'src/user/token-usage.service';

@Injectable()
export class NlpTransformationService extends BaseService {
    private readonly logger = new Logger(NlpTransformationService.name);
    private openai: OpenAI | null = null;
    private readonly systemPrompt = `You are a cognitive reframing assistant specializing in transforming limiting beliefs into empowering affirmations.

Your role is to:
1. Identify and extract the core belief pattern from the user's statement (which may be limiting, neutral, or already positive)
2. Transform it into a positive, empowering affirmation that:
   - Is written in first person (I am, I have, I can, etc.)
   - Is present tense and actionable
   - DIRECTLY addresses the specific topic/domain of the original belief (e.g., body image, relationships, work, etc.)
   - Uses language and concepts from the same domain as the original statement
   - Is specific and meaningful (not generic)
   - Maintains psychological authenticity
   - Empowers the user to see new possibilities
   - Is not a generic statement like "I choose to see new possibilities"
   - Is not a cliché
   - Focuses on the user's specific situation and concern

Guidelines:
- If the user's statement contains a limiting belief, extract it as a clear, concise statement of the negative pattern
- If the user's statement is already positive, identify the core belief or intention and strengthen/refine it
- If the user's statement is neutral, identify the core belief or intention and actively emphasize positive aspects, opportunities, and empowering perspectives
- The affirmation MUST stay on topic with the original belief. For example:
  * Body image belief → affirmation about body acceptance/appreciation
  * Work/career belief → affirmation about professional capability/success
  * Relationship belief → affirmation about connection/worthiness in relationships
- AVOID generic affirmations that could apply to any situation
- The affirmation should directly counter limiting beliefs when present, strengthen positive statements, or transform neutral statements into positive, empowering affirmations
- Keep affirmations realistic and achievable
- Use empowering language that inspires action
- Avoid clichés or overly generic statements

Return your response as a JSON object with exactly these two fields:
- "limitingBelief": A clear statement of the belief pattern (may be limiting, neutral, or positive)
- "generatedAffirmation": The empowering affirmation in first person that DIRECTLY addresses the same topic as the limiting belief`;

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
    async transformBelief(beliefText: string, userId?: string): Promise<{ limitingBelief: string; generatedAffirmation: string }> {
        if (!this.openai) {
            if (config.NODE_ENV === 'development') {
                this.logger.warn('OpenAI not configured. Returning placeholder transformation.');
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
                    this.logger.warn(`Token limit check failed for user ${userId}: ${error.message}`);
                }
                throw error;
            }
        }

        const timeoutMs = config.OPENAI_REQUEST_TIMEOUT_MS;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        try {
            if (config.NODE_ENV === 'development') {
                this.logger.log(`Starting NLP transformation for belief: ${beliefText.substring(0, 50)}...`);
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
            let parsedResponse: { limitingBelief: string; generatedAffirmation: string };
            try {
                parsedResponse = JSON.parse(content);
            } catch (parseError) {
                this.logger.error(`Failed to parse OpenAI JSON response: ${parseError.message}`);
                throw new Error('Invalid JSON response from OpenAI');
            }

            // Validate response structure
            if (!parsedResponse.limitingBelief || !parsedResponse.generatedAffirmation) {
                throw new Error('Missing required fields in OpenAI response');
            }

            // Sanitize and validate
            const limitingBelief = this.sanitizeText(parsedResponse.limitingBelief);
            const generatedAffirmation = this.sanitizeText(parsedResponse.generatedAffirmation);

            if (limitingBelief.length === 0 || generatedAffirmation.length === 0) {
                throw new Error('Empty fields after sanitization');
            }

            if (generatedAffirmation.length > 500 && config.NODE_ENV === 'development') {
                this.logger.warn(`Generated affirmation is very long (${generatedAffirmation.length} chars), truncating`);
            }

            if (config.NODE_ENV === 'development') {
                this.logger.log(`NLP transformation completed successfully. Affirmation length: ${generatedAffirmation.length} chars`);
            }

            return {
                limitingBelief,
                generatedAffirmation,
            };
        } catch (error) {
            this.logger.error(`Error in NLP transformation: ${error.message}`, error.stack);
            if (config.NODE_ENV === 'development') {
                this.logger.warn('Falling back to placeholder transformation due to error');
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
    private estimateTokens(text: string, maxResponseTokens: number = 500): number {
        const systemPromptTokens = Math.ceil(this.systemPrompt.length / 4);
        const userTextTokens = Math.ceil(text.length / 4);
        return Math.ceil((systemPromptTokens + userTextTokens + maxResponseTokens) * 1.1);
    }

    /**
     * Get placeholder transformation when OpenAI is unavailable or fails
     */
    private getPlaceholderTransformation(beliefText: string): { limitingBelief: string; generatedAffirmation: string } {
        const limitingBelief = beliefText || 'Belief pattern not identified';
        const generatedAffirmation = 'I am transforming my relationship with this belief. I choose to see new possibilities and create positive change in my life.';

        return {
            limitingBelief,
            generatedAffirmation,
        };
    }
} 