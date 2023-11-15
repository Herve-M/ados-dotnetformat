import path = require('path');
import mtr = require('azure-pipelines-task-lib/mock-toolrunner')
import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');

const taskPath = path.join(__dirname, '..', 'dotnetformat.js');
const  tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tmr.setInput('useGlobalToolOption', 'False');
tmr.setInput('command', 'check');
tmr.setInput('severityOption', 'error');
tmr.setInput('workspaceOption', '');
tmr.setInput('onlyChangedFiles', 'True');
tmr.setInput('noRestoreOption', 'False');
tmr.setInput('includeGeneratedOption', 'False');
tmr.setInput('diagnosticsOptions', '');
tmr.setInput('diagnosticsExcludedOptions', '');
tmr.setInput('verbosityOption', 'Quiet');

// .NET 6
tmr.registerMock('azure-pipelines-task-lib/toolrunner', mtr);
const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    "which": { 
        "dotnet": "c:\\path\\dotnet.exe",
        "git": "c:\\path\\git.exe"
    },
    "checkPath": { 
        "c:\\path\\dotnet.exe": true,
        "c:\\path\\git.exe": true
    },
    "exec": {
        "c:\\path\\git.exe diff main --name-only -- *.cs": {
            "code": 0,
            "stdout": "src/DotNetFormat/dotnetformat.ts\nsrc/DotNetFormat/utils/gittoolsrunner.ts",
            "stderr": ""
        },
        "c:\\path\\dotnet.exe format --version": {
            "code": 0,
            "stdout": "6.4.352107+29f0a64560676efb3c24bc01942bcd84d807b335",
            "stderr": ""
        },
        "c:\\path\\dotnet.exe format --include @FilesToCheck.rsp --severity error --verbosity quiet --binarylog c:/agent_work/1/a/Logs/format.binlog --verify-no-changes --report c:/agent_work/1/a/CodeAnalysisLogs/format.json": {
            "code": 0,
            "stdout": "OK",
            "stderr": ""
        }
    }
}
tmr.setAnswers(a);

tmr.run();

