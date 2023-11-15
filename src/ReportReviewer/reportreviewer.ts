import tl = require('azure-pipelines-task-lib/task');

async function run() {
    try {
        tl.setResult(tl.TaskResult.Succeeded, undefined, true);
    }
    catch (error: any) {
        tl.setResult(tl.TaskResult.Failed, error.message, true);
    }
}
run();