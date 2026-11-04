export class DatabaseToolkitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseToolkitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DatabaseToolkitError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export class ParseError extends DatabaseToolkitError {
  public readonly position?: number;
  public readonly line?: number;
  public readonly column?: number;

  constructor(message: string, options?: { position?: number; line?: number; column?: number }) {
    super(message);
    this.name = "ParseError";
    this.position = options?.position;
    this.line = options?.line;
    this.column = options?.column;
  }
}

export class UnsupportedSyntaxError extends DatabaseToolkitError {
  public readonly feature?: string;
  public readonly dialect?: string;

  constructor(message: string, feature?: string, dialect?: string) {
    super(message);
    this.name = "UnsupportedSyntaxError";
    this.feature = feature;
    this.dialect = dialect;
  }
}

export class InvalidIdentifierError extends DatabaseToolkitError {
  public readonly identifier: string;

  constructor(message: string, identifier: string) {
    super(message);
    this.name = "InvalidIdentifierError";
    this.identifier = identifier;
  }
}
