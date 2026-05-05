# ados-dotnetformat

This extension provide a task for checking or fixing code format, style and analyzer configuration using [dotnet-format](https://github.com/dotnet/format).

## Disclaimer

> [!WARNING]
>
> - ⚠️ The project is still under development.
> - ⚠️ Expect breaking changes until v1.

## How to use

### Compatibility matrix

| Requirement | Min. version         |
| ----------- | -------------------- |
| ADO API     | rest-7.1             |
| ADO Agent   | 3.227.1 (node v20.x) |

### Pre-requisites

* .NET or .NET Core installed, see [Use .NET Core task](https://docs.microsoft.com/en-us/azure/devops/pipelines/tasks/tool/dotnet-core-tool-installer?view=azure-devops)
* Either:
  * .NET 6 / 7 / 8 / 9 / 10 SDK, using `dotnet format`
  * .NET Global tool `dotnet-format` installed and accessible from the path

### Tasks

#### `UseDotNetFormat`

> [!NOTE]
> `dotnet-format` is included in the SDK since .NET 6, use this task only if you want to pin a specific version and/or try out dev-build.

> Setup pre-release, beta or specific version of `dotnet-format` from dnceng feeds.

![use-task](docs/images/use-task.png)
![use-overview](docs/images/use-overview.png)

``` yaml
- task: UseDotNetFormat@1
  displayName: 'setup-format feed'
  inputs:
    publicFeedServiceConnection: PublicDnceng
    feed: dotnet9
    definition: '54f95428-cc3a-48e0-b6a2-80280b31ba03' # dotnet-format nuget ID
    version: 9.0.507701
```

#### `DotNetFormatCli`

> Run `dotnet format` or `dotnet-format` to validate your code.

Feature:

- [X] check _(aka `verify-no-changes`)_
- [ ] fix  _(aka `format`)_
- [ ] custom command

Only touched files:

- [X] Git _(full checkout or ADO-API)_
- [ ] TFVC
- [ ] SVN

![format-task](docs/images/format-task.png)
![format-overview](docs/images/format-overview.png)

``` yaml
- task: DotNetFormatCLI@1
  displayName: "dotnet format"
  continueOnError: true # recommended if using ReportReviewer
  inputs:
    useGlobalTool: false
    command: 'check'
    workspace: 'YourSolution.sln'
    onlyChangedFiles: true #PR mode
    verbosity: Normal
    diffProvider: api # `native` using full checkout or `api` using ADO-API
    fileGlobPatterns: |
      *.cs
      *.vb
    excludes: | 
      /src/Project/FileToExclude.cs
  env:
    SYSTEM_ACCESSTOKEN: $(System.AccessToken) # required for ADO-API
```

#### `ReportReviewer`

> Comment an active Azure DevOps PullRequest with previous generated report.

Target:

- [X] Azure DevOps Service
- [X] Azure DevOps Server
- [ ] Github
- [ ] Github Enterprise Server
- [ ] Bitbucket Cloud
- [ ] Bitbucket Server

![reviewer-task](docs/images/reviewer-task.png)
![reviewer-overview](docs/images/reviewer-overview.png)

``` yaml
- task: ReportReviewer@1
  displayName: "dotnet format reporting"
  inputs:
    connectedServiceName: 'FormatReviewer'
    spamThreshold: 5
```

## Feedback and issues

If you have feedback or issues, please file an issue on GitHub.
