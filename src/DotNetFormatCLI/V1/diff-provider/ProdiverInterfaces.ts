export interface IDiffProvider {
    getChangeFor(filePatterns: ReadonlyArray<string>) : Promise<string[]>;
}