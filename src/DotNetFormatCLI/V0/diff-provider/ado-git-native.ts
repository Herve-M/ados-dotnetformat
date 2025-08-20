import ct = require('../common/context');
import provider = require('./ProdiverInterfaces');
import os = require('os');
import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
const mm = require('micromatch');

export class AdoGitNativeDiffProvider implements provider.IDiffProvider {

    public static readonly ToolName: string = "git"; 

    private readonly repositoryDirectory: string;
    private readonly gitToolPath: string;
    private readonly isDebug: boolean;    
    private readonly targetBranch: string;

    constructor(ctx: Readonly<ct.IExtensionContext>){
        this.repositoryDirectory = ctx.Environment.RepositoryPath;
        this.targetBranch = ctx.Environment.TargetBranch;
        this.gitToolPath = tl.which(AdoGitNativeDiffProvider.ToolName, true);
        this.isDebug = ctx.Environment.IsDebug;
    }

    public async getChangeFor(filePatterns: ReadonlyArray<string>): Promise<string[]> {
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
                .arg(['diff', `origin/${this.targetBranch.replace('refs/heads/', '')}`, '--name-only'])
                .on('stdout', (data) => {
                    stdout += data.toString();
                })
                .execAsync(options);

            tl.debug(`Result (${result}): ${stdout}`);
            return stdout
                .split(os.EOL)
                .filter(filePath => mm.isMatch(filePath, filePatterns, {matchBase: true}));
        } catch (error: any) {
            tl.error(error);
            tl.setResult(tl.TaskResult.Failed, `Git diff failed ${error}`);
            throw new Error('While trying to get the diff. using ADO native git stategy.');
        }
    }
}