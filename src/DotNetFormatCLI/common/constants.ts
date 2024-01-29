export const Constants = {
    // Task input
    InputWorkingDirectoryOption: 'workingDirectory',
    InputUseGlobalToolOption: 'useGlobalTool',
    InputCommand: 'command',
    InputWorkspaceOption: 'workspace',
    InputOnlyChangedFiles: 'onlyChangedFiles',
    InputIncludeOptions: 'include',
    InputExcludeOptions: 'exclude',
    InputSeverityOption: 'severity',
    InputNoRestoreOption: 'noRestore',
    InputIncludeGeneratedOption: 'includeGenerated',
    InputDiagnosticsOptions: 'diagnostics',
    InputDiagnosticsExcludedOptions: 'diagnosticsExcluded',
    InputVerbosityOption: 'verbosity',
    InputDiffProviderOption: 'diffProvider',
    InputFileGlobPatternOption: 'fileGlobPatterns',
    // Task output
    //TODO: add output
    OutputResult: 'format-result',
    // Env.
    VarDebug: 'System.Debug',
    VarAccessToken: 'System.AccessToken',
    VarCollectionUri: 'System.CollectionUri',
    VarProjectId: 'System.TeamProjectId',
    VarTargetBranch: 'System.PullRequest.TargetBranch',
    VarPullRequestId: 'System.PullRequest.PullRequestId', 
    VarBuildReason: 'Build.Reason',
    VarRepositoryId: 'Build.Repository.ID',
    VarPullRequestCommit: 'System.PullRequest.SourceCommitId',
    VarRepositoryProvider: 'Build.Repository.Provider',
    VarRepositoryPath: 'Build.Repository.LocalPath',
    VarArtifactStagingDirectory: 'Build.ArtifactStagingDirectory'
} as const;