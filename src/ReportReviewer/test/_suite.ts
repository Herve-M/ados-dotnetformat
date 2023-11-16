import assert = require('assert');
import path = require('path');
import rr = require('../common/reportReader');

describe('report-reviewer suite', function () {
    this.timeout(2500);
    before(() => {
    });

    after(() => {
    });  
});

describe('report-reader suite', function () {
    this.timeout(2500);
    before(() => {
    });

    after(() => {
    });

    const testFiles = [
        {os: 'win', type: 'formatter', rootRepositoryPath: 'c:\\agent_work\\1\\s\\', reportFilePath: path.join(__dirname, 'data', 'formatter-report-win.json'), expected: 4},
        {os: 'linux', type: 'formatter', rootRepositoryPath: '/home/vsts/work/1/s/', reportFilePath: path.join(__dirname, 'data', 'formatter-report-linux.json'), expected: 4},
        {os: 'win', type: 'analyzer', rootRepositoryPath: 'c:\\agent_work\\1\\s\\', reportFilePath: path.join(__dirname, 'data', 'analyzer-report-win.json'), expected: 13},
        {os: 'linux', type: 'analyzer', rootRepositoryPath: '/home/vsts/work/1/s/', reportFilePath: path.join(__dirname, 'data', 'analyzer-report-linux.json'), expected: 13}
    ];

    describe('readReport', function () {
       testFiles.forEach(({os, type, reportFilePath, expected}) => {
            it(`should able to read ${type} report of ${os}`, async function () {
                const result = await rr.forTestingOnly.readReport(reportFilePath)
                assert.equal(result.length, expected);
            });
        });
    });

    describe('importReport', function(){
        testFiles.forEach(({os, type, rootRepositoryPath, reportFilePath, expected}) => {
            it(`Imported information should have same content as raw reading ${os}:${type}`, async function () {
                const result = await rr.importReport(reportFilePath, rootRepositoryPath);
                assert.equal(result.length, expected);
            });
        });

        testFiles.forEach(({os, type, rootRepositoryPath, reportFilePath}) => {
            it(`FileRelativePath should not contains Windows path seperator for ${os}:${type}`, async function () {
                const result = await rr.importReport(reportFilePath, rootRepositoryPath);

                result.forEach((document) => {
                    assert.equal(document.FileRef.FileRelativePath.includes('\\'), false);
                });
            });
        });

        testFiles.forEach(({os, type, rootRepositoryPath, reportFilePath}) => {
            it(`FileRelativePath should not repository root path for ${os}:${type}`, async function () {
                const result = await rr.importReport(reportFilePath, rootRepositoryPath);

                result.forEach((document) => {;
                    assert.equal(document.FileRef.FileRelativePath.indexOf(rootRepositoryPath), -1);
                });
            });
        });
    });
});