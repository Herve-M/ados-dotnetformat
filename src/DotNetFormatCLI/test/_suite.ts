import * as assert from 'assert';
import * as path from 'path';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

import os = require('os');
import fs = require('fs');

describe('donetformat suite', function () {
    this.timeout(2500);
    before(() => {
    });

    after(() => {
    });

    context('.NET 6', function() {
        it('should succeed with good inputs for manual checking, without debug, .NET 6', async function() {
            const tp = path.join(__dirname, 'succeed-check-noPR-net6.js');
            const tptask = path.join(__dirname, '..', 'task.json');
    
            process.env['SYSTEM_DEBUG'] = 'False';
            process.env['BUILD_REASON'] = 'Manual';
            process.env['BUILD_REPOSITORY_LOCALPATH'] = 'c:/agent_work/1/s';
            process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] = 'c:/agent_work/1/a';
            const tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp, tptask);
            await tr.runAsync();
    
            assert.equal(tr.succeeded, true, 'should have succeed');
        });
    
        it('should succeed with good inputs for manual checking, with debug, .NET 6', async function() {
            const tp = path.join(__dirname, 'succeed-check-noPR-dbg-net6.js');
            const tptask = path.join(__dirname, '..', 'task.json');
    
            process.env['SYSTEM_DEBUG'] = 'True';
            process.env['BUILD_REASON'] = 'Manual';
            process.env['BUILD_REPOSITORY_LOCALPATH'] = 'c:/agent_work/1/s';
            process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] = 'c:/agent_work/1/a';
            const tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp, tptask);
            await tr.runAsync();
    
            assert.equal(tr.succeeded, true, 'should have succeed');
        });

        it('should successfully fail with good inputs for manual checking, without debug, .NET 6', async function() {
            const tp = path.join(__dirname, 'failled-check-noPR-net6.js');
            const tptask = path.join(__dirname, '..', 'task.json');
    
            process.env['SYSTEM_DEBUG'] = 'False';
            process.env['BUILD_REASON'] = 'Manual';
            process.env['BUILD_REPOSITORY_LOCALPATH'] = 'c:/agent_work/1/s';
            process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] = 'c:/agent_work/1/a';
            const tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp, tptask);
            await tr.runAsync();
    
            assert.equal(tr.failed, true, 'should have failed');
        });
    
        it('should succeed with advanced inputs for manual checking, without debug, .NET 6', async function() {
            const tp = path.join(__dirname, 'succeed-check-advInputs-net6.js');
            const tptask = path.join(__dirname, '..', 'task.json');
    
            process.env['SYSTEM_DEBUG'] = 'False';
            process.env['BUILD_REASON'] = 'Manual';
            process.env['BUILD_REPOSITORY_LOCALPATH'] = 'c:/agent_work/1/s';
            process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] = 'c:/agent_work/1/a';
            const tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp, tptask);
            await tr.runAsync();
    
            assert.equal(tr.succeeded, true, 'should have succeed');
        });
    
        it('should succeed with good inputs for PR checking, with debug, .NET 6', async function() {
            const tp = path.join(__dirname, 'succeed-check-PR-dbg-net6.js');
            const tptask = path.join(__dirname, '..', 'task.json');
    
            process.env['SYSTEM_DEBUG'] = 'True';
            process.env['BUILD_REASON'] = 'PullRequest';
            process.env['BUILD_REPOSITORY_LOCALPATH'] = 'c:/agent_work/1/s';
            process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] = 'c:/agent_work/1/a';
            const tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp, tptask);
            await tr.runAsync();
    
            assert.equal(tr.succeeded, true, 'should have succeed');
        });
    
        it('should succeed with good inputs for impacted files only dugin PR checking using git, with debug, .NET 6', async function() {
            const tp = path.join(__dirname, 'succeed-check-partialPR-git_native-dbg-net6.js');
            const tptask = path.join(__dirname, '..', 'task.json');
    
            process.env['SYSTEM_DEBUG'] = 'True';
            process.env['BUILD_REASON'] = 'PullRequest';
            process.env['SYSTEM_PULLREQUEST_TARGETBRANCH'] = 'main';
            process.env['BUILD_REPOSITORY_LOCALPATH'] = 'c:/agent_work/1/s';
            process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] = 'c:/agent_work/1/a';
            const tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp, tptask);
            await tr.runAsync();
    
            assert.equal(tr.succeeded, true, 'should have succeed');
        });

        it('should succeed with good inputs for impacted files only dugin PR checking using ADO-API, with debug, .NET 6', async function() {
            const tp = path.join(__dirname, 'succeed-check-partialPR-git_api-dbg-net6.js');
            const tptask = path.join(__dirname, '..', 'task.json');
    
            process.env['SYSTEM_DEBUG'] = 'True';
            process.env['BUILD_REASON'] = 'PullRequest';
            process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] = 'c:/agent_work/1/a';
            process.env['SYSTEM_COLLECTIONURI'] = 'http://localhost/MyCollection';
            process.env['SYSTEM_ACCESSTOKEN'] = 'abcedfg';
            process.env['BUILD_REPOSITORY_ID'] = '1';
            process.env['SYSTEM_TEAMPROJECTID'] = '1';
            process.env['SYSTEM_PULLREQUEST_SOURCECOMMITID'] = '1';
            const tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp, tptask);
            await tr.runAsync();
    
            assert.equal(tr.succeeded, true, 'should have succeed');
        });
    });    
});