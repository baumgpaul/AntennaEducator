// troika-three-text ships no type declarations; only what threeTextConfig.ts uses.
declare module 'troika-three-text' {
  export function configureTextBuilder(config: {
    useWorker?: boolean;
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
  }): void;
}
