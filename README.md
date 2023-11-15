# ados-dotnetformat

This extension provide a task for checking or fixing code format, style and analyzer configuration using [dotnet-format](https://github.com/dotnet/format).

## How to use

### Pre-requisites

* .Net Core installed, see [Use .NET Core task](https://docs.microsoft.com/en-us/azure/devops/pipelines/tasks/tool/dotnet-core-tool-installer?view=azure-devops)
* Either:
  * .NET 6 / 7 / 8 SDK, using `dotnet format` 
  * .NET Global tool `dotnet-format` installed and accessible from the path

### Tasks

#### dotnet-format

> Run `dotnet format` or `dotnet-format` to validate your code.

![format-task](docs/images/format-task.png)
![format-overview](docs/images/format-overview.png)

## Feedback and issues

If you have feedback or issues, please file an issue on GitHub.