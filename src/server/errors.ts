/** Domain errors. Messages are user-facing (French). */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Vous n'avez pas accès à cette ressource.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Élément introuvable.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Veuillez vous connecter.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Trop de tentatives. Réessayez dans quelques minutes.") {
    super(message, "RATE_LIMITED", 429);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Certaines informations sont invalides.",
    public readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message, "VALIDATION", 422);
  }
}
