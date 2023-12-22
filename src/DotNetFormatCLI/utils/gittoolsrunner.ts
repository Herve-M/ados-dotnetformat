import os = require('os');
import tl = require("azure-pipelines-task-lib/task");
import tr = require("azure-pipelines-task-lib/toolrunner");

export class GitToolRunner {

    public static readonly ToolName: string = "git"; 

    private readonly repositoryDirectory: string;
    private readonly gitToolPath: string;
    private readonly isDebug: boolean;    

    constructor(){
        this.repositoryDirectory = tl.getVariable("Build.Repository.LocalPath")!;
        this.gitToolPath = tl.which(GitToolRunner.ToolName, true);
        this.isDebug = tl.getVariable("System.Debug") == 'True';
    }

    public async getChangeFor(refBranch: Readonly<string>, filePattern: Readonly<string>): Promise<string[]> {
        let options: tr.IExecOptions = {
            cwd: this.repositoryDirectory,
            silent: !this.isDebug
        };

        try {
            if(this.isDebug){
                await tl
                    .tool(this.gitToolPath)
                    .line('remote show origin')
                    .execAsync(options);

                await tl
                    .tool(this.gitToolPath)
                    .line('branch')
                    .execAsync(options);                
            }

            let stdout = '';
            const result = await tl
                .tool(this.gitToolPath)
                .arg(['diff', `origin/${refBranch.replace('refs/heads/', '')}`, '--name-only', '--', `${filePattern}`])
                .on('stdout', (data) => {
                    stdout += data.toString();
                })
                .execAsync(options);

            console.debug(`Result (${result}): ${stdout}`)
            tl.setResult(tl.TaskResult.Succeeded, `Git diff succeed ${result}`);
            return stdout.split(os.EOL);
        } catch (error: any) {
            tl.error(error);
            tl.setResult(tl.TaskResult.Failed, `Git diff failed ${error}`);
        }
        return [];
    }
}