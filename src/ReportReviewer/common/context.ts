import { SeverityLevel } from "./reportReader";

export interface IExtensionContext {
    readonly Environement: IEnvironement,
    readonly Settings: ISettings,
}

export interface IEnvironement {
    readonly IsDebug: boolean
}

export interface ISettings {
    readonly MinSeverityLevel: SeverityLevel,
    readonly SpamThreshold: number,
    readonly IgnoredDiagnosticIds: ReadonlyArray<string>
}