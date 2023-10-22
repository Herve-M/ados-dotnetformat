import path = require('path');
import tl = require("azure-pipelines-task-lib/task");

export const Constants = {
    ServiceConnectionInputName: 'publicFeedServiceConnection',
    ParameterFeedName: 'feed',
    ParameterPackageName: 'definition',
    ParameterPackageVersion: 'version',
    VarDebug: 'System.Debug'
} as const;


function getFeedUrlByName(feedName: string): string{
    switch (feedName) {
        case "dotnet9":
            return "https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet9%40Local/nuget/v3/index.json";
        case "dotnet8":
            return "https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet8%40Local/nuget/v3/index.json";
        case "dotnet7":
            return "https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet7%40Local/nuget/v3/index.json";
        case "dotnet6":
            return "https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet6%40Local/nuget/v3/index.json";
        default:
            tl.logIssue(tl.IssueType.Warning, `Given ${feedName} isn't supported yet, using latest LTS`);
            return "https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet6%40Local/nuget/v3/index.json"; //return LTS by default
    }
}

async function run(){
    try {
        const isDebug = tl.getVariable(Constants.VarDebug) === 'True';

        const dotnetPath = tl.which("dotnet", true);
        
        if(isDebug){
            await tl
                .tool(dotnetPath)
                .arg("--info")
                .execAsync();
        }

        const feedName = tl.getInput(Constants.ParameterFeedName, true)!;
        const packageVersion = tl.getInput(Constants.ParameterPackageVersion, true)!;

        let tool = tl.tool(dotnetPath);
        await tool
            .line(`tool install -g dotnet-format --version "${packageVersion}" --add-source ${getFeedUrlByName(feedName)}`)
            .execAsync();

        if(isDebug){
            const dotnetFormatPath = tl.which("dotnet-format", true);
            await tl
                .tool(dotnetFormatPath)
                .arg("--version")
                .execAsync();
        }
    }
    catch(err: any ){
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

run(); 