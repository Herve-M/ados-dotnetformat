export interface IDiffProvider {
    getChangeFor(filePattern: Readonly<string>) : Promise<string[]>;
}