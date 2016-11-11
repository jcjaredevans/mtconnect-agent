/**
  * Copyright 2016, System Insights, Inc.
  *
  * Licensed under the Apache License, Version 2.0 (the "License");
  * you may not use this file except in compliance with the License.
  * You may obtain a copy of the License at
  *
  *    http://www.apache.org/licenses/LICENSE-2.0
  *
  * Unless required by applicable law or agreed to in writing, software
  * distributed under the License is distributed on an "AS IS" BASIS,
  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  * See the License for the specific language governing permissions and
  * limitations under the License.
  */

// Imports - External

const sinon = require('sinon');
const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const tmp = require('tmp');
const R = require('ramda');
// Imports - Internal

const log = require('../src/config/logger');
const common = require('../src/common');
const dataStorage = require('../src/dataStorage');
const lokijs = require('../src/lokijs');
const ag = require('../src/main');

// constants
const cbPtr = dataStorage.circularBuffer;
const schemaPtr = lokijs.getSchemaDB();
const rawData = lokijs.getRawDataDB();
const uuid = '000';
const shdrString2 = '2014-08-13T07:38:27.663Z|execution|UNAVAILABLE|line|' +
                  'UNAVAILABLE|mode|UNAVAILABLE|' +
                  'program|UNAVAILABLE|Fovr|UNAVAILABLE|Sovr|UNAVAILABLE';
const shdrString1 = '2014-08-11T08:32:54.028533Z|avail|AVAILABLE';
const shdrString3 = '2010-09-29T23:59:33.460470Z|htemp|WARNING|HTEMP|1|HIGH|Oil Temperature High';
const shdrString4 = '2016-04-12T20:27:01.0530|Cloadc|NORMAL||||';
const result1 = { time: '2014-08-11T08:32:54.028533Z',
dataitem: [{ name: 'avail', value: 'AVAILABLE' }] };

const result2 = { time: '2014-08-13T07:38:27.663Z',
  dataitem:
   [{ name: 'execution', value: 'UNAVAILABLE' },
     { name: 'line', value: 'UNAVAILABLE' },
     { name: 'mode', value: 'UNAVAILABLE' },
     { name: 'program', value: 'UNAVAILABLE' },
     { name: 'Fovr', value: 'UNAVAILABLE' },
     { name: 'Sovr', value: 'UNAVAILABLE' } ] };

const result3 = { time: '2010-09-29T23:59:33.460470Z',
  dataitem:
   [ { name: 'htemp',
       value: [ 'WARNING', 'HTEMP', '1', 'HIGH', 'Oil Temperature High' ] } ] };
const result4 = { time: '2016-04-12T20:27:01.0530',
  dataitem: [ { name: 'Cloadc', value: [ 'NORMAL', '', '', '', '' ] } ] }

// Tests

describe('On receiving data from adapter', () => {
  describe('inputParsing()', () => {
    before(() => {
      schemaPtr.clear();
      const jsonFile = fs.readFileSync('./test/support/VMC-3Axis.json', 'utf8');
      lokijs.insertSchemaToDB(JSON.parse(jsonFile));
    });
    after(() => {
      schemaPtr.clear();
    })
    it('parses shdr with single dataitem correctly', () => {
      expect(common.inputParsing(shdrString1, '000')).to.eql(result1)
    });
    it('parses shdr with multiple dataitem correctly', () => {
      expect(common.inputParsing(shdrString2, '000')).to.eql(result2)
    });
    it('parses dataitem with category CONDITION', () => {
      expect(common.inputParsing(shdrString3, '000')).to.eql(result3)
    });
    it('parses dataitem with category CONDITION and empty pipes correctly', () => {
      expect(common.inputParsing(shdrString4, '000')).to.eql(result4)
    });

  });
});

describe('For every Device', () => {
  before(() => {
    rawData.clear();
    schemaPtr.clear();
    cbPtr.fill(null).empty();
    dataStorage.hashCurrent.clear();
    dataStorage.hashLast.clear();
  });

  after(() => {
    dataStorage.hashLast.clear();
    dataStorage.hashCurrent.clear();
    cbPtr.fill(null).empty();
    schemaPtr.clear();
    rawData.clear();
  });

  describe('getDeviceUuid()', () => {
    it('get the uuid for the given DeviceName if present', () => {
      const jsonFile = fs.readFileSync('./test/support/jsonFile', 'utf8');
      lokijs.insertSchemaToDB(JSON.parse(jsonFile));
      expect(common.getDeviceUuid('VMC-3Axis')).to.eql(uuid)
    });

    it('gives undefined if not present', () => {
      expect(common.getDeviceUuid('VMC-3Axis-1')).to.eql(undefined)
    });
  });
});

describe('processError', () => {
  describe('without exit', () => {
    it('should just log and return', () => {
      common.processError('Test', false);
    });
  });

  describe('with exit', () => {
    let save;
    let spy;

    before(() => {
      save = sinon.stub(process, 'exit');
      spy = sinon.spy(log, 'error');
    });

    after(() => {
      save.restore();
      log.error.restore();
    });

    it('should log and exit', () => {
      save.yields(common.processError('Test', true));
      expect(spy.callCount).to.be.equal(1);
    });
  });
});

describe('pathValidation, check whether the path is a valid one', () => {
  before(() => {
    rawData.clear();
    schemaPtr.clear();
    cbPtr.fill(null).empty();
    dataStorage.hashCurrent.clear();
    dataStorage.hashLast.clear();
  });

  after(() => {
    dataStorage.hashLast.clear();
    dataStorage.hashCurrent.clear();
    cbPtr.fill(null).empty();
    schemaPtr.clear();
    rawData.clear();
  });

  it('returns true if valid', () => {
    const jsonFile = fs.readFileSync('./test/support/jsonFile', 'utf8');
    lokijs.insertSchemaToDB(JSON.parse(jsonFile));
    let result = lokijs.pathValidation('//DataItem[@type="AVAILABILITY"]', ['000'])
    expect(result).to.eql(true);
  })

  it('returns false if not valid', () => {
    const jsonFile = fs.readFileSync('./test/support/jsonFile', 'utf8');
    lokijs.insertSchemaToDB(JSON.parse(jsonFile));
    let result = lokijs.pathValidation('//Axes', ['000'])
    expect(result).to.eql(false);
  })
});

describe('get MTConnect version from XML', () => {
  let version;

  context('success', () => {
    before(() => {
      const deviceXML = fs.readFileSync('test/support/VMC-3Axis.xml', 'utf8');
      version = common.getMTConnectVersion(deviceXML);
    });

    it('should return the correct version number', () => {
      expect(version).to.eql('1.1')
    });
  })

  context('failure', () => {
    let spy;

    before(() => {
      spy = sinon.spy(log, 'error');

      const deviceXML = fs.readFileSync('test/support/VMC-3Axis-no-version.xml', 'utf8');
      version = common.getMTConnectVersion(deviceXML);
    });

    after(() => {
      log.error.restore();
    });

    it('must log error', () => {
      expect(version).to.be.equal(null);
      expect(spy.callCount).to.be.equal(1);
    });
  });
})

describe('MTConnect validate', () => {
  context('success', () => {
    let status;

    before(() => {
      const deviceXML = fs.readFileSync('test/support/VMC-3Axis.xml', 'utf8');
      status = common.mtConnectValidate(deviceXML);
    });

    it('should return true', () => {
      expect(status).to.be.equal(true);
    })
  });

  context('no version', () => {
    let status;
    let spy;

    before(() => {
      spy = sinon.spy(log, 'error');

      const deviceXML = fs.readFileSync('test/support/VMC-3Axis-no-version.xml', 'utf8');
      status = common.mtConnectValidate(deviceXML);
    });

    after(() => {
      log.error.restore();
    });

    it('must log error', () => {
      expect(status).to.be.equal(false);
      expect(spy.callCount).to.be.equal(1);
    });
  });

  context('non-supported version', () => {
    let status;
    let spy;

    before(() => {
      spy = sinon.spy(log, 'error');

      const deviceXML = fs.readFileSync('test/support/VMC-3Axis-non-supported-version.xml', 'utf8');
      status = common.mtConnectValidate(deviceXML);
    });

    after(() => {
      log.error.restore();
    });

    it('must log error', () => {
      expect(status).to.be.equal(false);
    });
  });

  context('validation failure', () => {
    let status;
    let spy;

    before(() => {
      spy = sinon.spy(log, 'error');

      const deviceXML = fs.readFileSync('test/support/VMC-3Axis-validation-fail.xml', 'utf8');
      status = common.mtConnectValidate(deviceXML);
    });

    after(() => {
      log.error.restore();
    });

    it('must log error', () => {
      expect(status).to.be.equal(false);
    });
  });

  context('writeFileSync error', () => {
    let save;
    let spy;
    let status;

    before(() => {
      save = sinon.stub(tmp, 'tmpNameSync');
      save.onCall(0).returns('/tmpoo/foo.xml');

      spy = sinon.spy(log, 'error');

      const deviceXML = fs.readFileSync('test/support/VMC-3Axis.xml', 'utf8');
      status = common.mtConnectValidate(deviceXML);
    });

    after(() => {
      log.error.restore();

      tmp.tmpNameSync.restore();
    });

    it('should fail creating write file', () => {
      expect(status).to.be.equal(false);
      expect(spy.callCount).to.be.equal(1);
    });
  });
});

describe('getCurrentTimeInSec()', () => {
  it('gives the present time in seconds', (done) => {
     let time1 = common.getCurrentTimeInSec();
     let time2;
     setTimeout(() => {
       time2 = common.getCurrentTimeInSec();
       expect(time1).to.be.lessThan(time2);
       done();
     }, 1000);
  });
});


describe('duplicateUuidCheck()', () => {
  let devices = ag.devices;
  it('does not add device with existing to the device collection', () => {
    devices.insert({uuid: '000', address: '192.168.100.4', port: 7000})
    common.duplicateUuidCheck('000', devices);
  });
});


describe('updateAssetCollection() parses the SHDR data and', () => {
  let shdr1 = '2012-02-21T23:59:33.460470Z|@ASSET@|EM233|CuttingTool|<CuttingTool serialNumber="ABC" toolId="10" assetId="ABC">'+
  '<Description></Description><CuttingToolLifeCycle><ToolLife countDirection="UP" limit="0" type="MINUTES">160</ToolLife>'+
  '<Location type="POT">10</Location><Measurements><FunctionalLength code="LF" minimum="0" nominal="3.7963">3.7963</FunctionalLength>'+
  '<CuttingDiameterMax code="DC" minimum="0" nominal="0">0</CuttingDiameterMax></Measurements></CuttingToolLifeCycle></CuttingTool>';
  let assetBuffer = dataStorage.assetBuffer;
  before(() => {
    dataStorage.hashAssetCurrent.clear();
    assetBuffer.fill(null).empty();
  });

  after(() => {
    dataStorage.hashAssetCurrent.clear();
    assetBuffer.fill(null).empty();
  });

  it('update the assetBuffer and hashAssetCurrent with the data', () => {
    let jsonObj = common.inputParsing(shdr1);
    lokijs.dataCollectionUpdate(jsonObj, '000');
    let assetData = dataStorage.hashAssetCurrent.get('EM233');
    expect(assetData.time).to.eql('2012-02-21T23:59:33.460470Z');
    expect(assetData.assetType).to.eql('CuttingTool');
    expect(assetBuffer.data[0].assetType).to.eql('CuttingTool');
  });

    it('@UPDATE_ASSET@, updates the change received in the new data', () => {
      let update1 = '2012-02-21T23:59:34.460470Z|@UPDATE_ASSET@|EM233|ToolLife|120|CuttingDiameterMax|40';
      const jsonObj = common.inputParsing(update1);
      lokijs.dataCollectionUpdate(jsonObj, '000');
      const updatedAsset = dataStorage.hashAssetCurrent.get('EM233');
      const CuttingToolLifeCycle = updatedAsset.value.CuttingTool.CuttingToolLifeCycle[0];
      const value1 = CuttingToolLifeCycle.ToolLife[0]._;
      const value2 = CuttingToolLifeCycle.Measurements[0].CuttingDiameterMax[0]._;
      const assetArray = assetBuffer.toArray();
      const newData = assetArray[assetArray.length - 1];
      const time = '2012-02-21T23:59:34.460470Z';
      expect(updatedAsset.time).to.eql(time);
      expect(value1).to.eql('120');
      expect(value2).to.eql('40');
      expect(newData.time).to.eql(time)
    });
})




// TODO modify test on receiving shdr from Will
describe.skip('@REMOVE_ASSET@', () => {
  let assetBuffer = dataStorage.assetBuffer;
  let shdr1 = '2|@ASSET@|EM233|CuttingTool|<CuttingTool serialNumber="ABC" toolId="10" assetId="ABC">'+
  '<Description></Description><CuttingToolLifeCycle><ToolLife countDirection="UP" limit="0" type="MINUTES">160</ToolLife>'+
  '<Location type="POT">10</Location><Measurements><FunctionalLength code="LF" minimum="0" nominal="3.7963">3.7963</FunctionalLength>'+
  '<CuttingDiameterMax code="DC" minimum="0" nominal="0">0</CuttingDiameterMax></Measurements></CuttingToolLifeCycle></CuttingTool>';
  let shdr2 = '2|@REMOVE_ASSET@|EM233|';
  before(() => {
    assetBuffer.fill(null).empty();
    dataStorage.hashAssetCurrent.clear();
  });

  after(() => {
    dataStorage.hashAssetCurrent.clear();
    assetBuffer.fill(null).empty();
  });

  it('asset has been removed from the assetCollection', () => {
    let jsonObj = common.inputParsing(shdr1);
    lokijs.dataCollectionUpdate(jsonObj);
    let jsonObj1 = common.inputParsing(shdr2);
    lokijs.dataCollectionUpdate(jsonObj1);
    let removedData = dataStorage.hashAssetCurrent.get('EM233');
    expect(removedData.removed).to.eql(true);
  });
});
