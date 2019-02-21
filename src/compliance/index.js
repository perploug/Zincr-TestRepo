var MochaRunner = require("./mocha-runner"),
  fs = require("fs"),
  path = require("path"),
  cfg;

var init = function(config) {
  cfg = config;

  return {
    runTests
  };
};

var runTests = async function(org, repository, options = {}) {
  const testRunner = new MochaRunner(options);
  var testDir = __dirname + "/tests";

  // Add each .js file to the mocha instance
  var specs = fs
    .readdirSync(testDir)
    .filter(function(file) {
      // Only keep the .js files
      return file.substr(-3) === ".js";
    })
    .map(function(file) {
      return path.join(testDir, file);
    });

  //Nasty, but we need to pass in repo and org..
  global.tl_compliance_org = org;
  global.tl_compliance_repo = repository;
  global.tl_compliance_config = cfg;

  try {
    await testRunner.run(specs);
  } catch (e) {
    //console.log(e);
  }

  try {
    await testRunner.cleanup();
  } catch (e) {}
};

module.exports = init;
