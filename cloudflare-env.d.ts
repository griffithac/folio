declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TYPESAFE_API_KEY?: string;
    TYPESAFE_MODEL?: string;
    CLASSIFICATION_DAILY_LIMIT?: string;
  }
}
