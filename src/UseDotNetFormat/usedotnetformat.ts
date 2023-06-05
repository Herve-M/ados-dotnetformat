import path = require('path');
import tl = require("azure-pipelines-task-lib/task");
import toolLib = require("azure-pipelines-tool-lib/tool");

async function run(){
    try {

    }
    catch(err: any ){
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}
run(); 