export interface PublicWorldBuildResult {
  output: {
    schemaVersion: number;
    generatedAt: string;
    source: { file: string | null; sha256: string | null };
    counts: {
      buildings: number;
      objects: number;
      businesses: number;
      places: number;
      models: number;
    };
    modelIds: string[];
    document: Record<string, unknown>;
    models: unknown[];
  };
  serialized: string;
  warnings: string[];
  preservedKeys: string[];
}

export function buildPublicWorld(
  input: unknown,
  options?: {
    warnings?: string[];
    sourceName?: string | null;
    sourceSha256?: string | null;
  },
): PublicWorldBuildResult;

export function writePublicWorld(serialized: string): Promise<string>;
export function sha256(value: string | Uint8Array): string;
