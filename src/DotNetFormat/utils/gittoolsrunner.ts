import os = require('os');
import tl = require("azure-pipelines-task-lib/task");
import tr = require("azure-pipelines-task-lib/toolrunner");

export class GitToolRunner {

    public static readonly ToolName: string = "git"; 

    private readonly repositoryDirectory: string;
    private readonly gitToolPath: string;    

    constructor(){
        this.repositoryDirectory = tl.getVariable("Build.Repository.LocalPath")!;
        this.gitToolPath = tl.which(GitToolRunner.ToolName, true);
    }

    public getChangeFor(refBranch: Readonly<string>, filePattern: Readonly<string>): string[] {
        let options: tr.IExecOptions = {
            cwd: this.repositoryDirectory,
            silent: true
        };

        try {
            let result = tl
                .tool(this.gitToolPath)
                .arg([`diff ${refBranch}`, `--name-only`, `-- ${filePattern}`])
                .execSync(options);

            console.debug(`Result: ${result.stdout}`)
            tl.setResult(tl.TaskResult.Succeeded, `Git diff succeed ${result.code}`);
            return result.stdout.split(os.EOL);
        } catch (error: any) {
            tl.error(error);
            tl.setResult(tl.TaskResult.Failed, `Git diff failed ${error}`);
        }
        return [];
    }
}