// This DTO is primarily for documentation purposes
// The actual audio file is handled via multipart/form-data in the controller
export class RecordAffirmationDto {
  // Audio file is handled via @UploadedFile() decorator in controller
  // No additional fields needed for now
  // Future: Could add metadata like background music selection, duration, etc.
}
