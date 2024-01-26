import provider = require('./ProdiverInterfaces');
import os = require('os');
import tl = require("azure-pipelines-task-lib/task");
import tr = require("azure-pipelines-task-lib/toolrunner");

export class AdoGitNativeDiffProvider implements provider.IDiffProvider {

    public static readonly ToolName: string = "git"; 

    private readonly repositoryDirectory: string;
    private readonly gitToolPath: string;
    private readonly isDebug: boolean;    
    private readonly targetBranch: string;

    constructor(){
        this.repositoryDirectory = tl.getVariable('Build.Repository.LocalPath')!;
        this.targetBranch = tl.getVariable('System.PullRequest.TargetBranch')!;
        this.gitToolPath = tl.which(AdoGitNativeDiffProvider.ToolName, true);
        this.isDebug = tl.getVariable("System.Debug") == 'True';
    }

    public async getChangeFor(filePattern: Readonly<string>): Promise<string[]> {
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
                .arg(['diff', `origin/${this.targetBranch.replace('refs/heads/', '')}`, '--name-only', '--', `${filePattern}`])
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