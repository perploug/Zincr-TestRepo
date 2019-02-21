var client,
  trafficLightConfig,
  gh_client,
  github = require("../github"),
  utill = require("./utill"),
  Table = require("cli-table2");

//config for the CLI
var config = {
  repo: "",
  org: ""
};

var askForProjectDetails = function(ctx, args, cb) {
  ctx.log("Migrate legacy teams");
  ctx.log("---------------------------");
  ctx.log("");

  if (args.org) {
    config.org = args.org;
  }

  ctx.prompt(
    [
      {
        type: "list",
        name: "org",
        message: "organisation?:   ",
        default: 0,
        choices: trafficLightConfig.organisations,
        when: function() {
          return !config.org;
        }
      }
    ],
    function(answers) {
      config = { ...config, ...answers };
      config.teams = [];

      migrateTeams(ctx, cb);
    }
  );
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

var _ignoreTeams = [
  "Legacy Teams",
  "Project Teams",
  "Open Source Review Group"
];
var migrateTeams = function(ctx, cb) {
  ctx.log("Migrating legacy teams");
  ctx.log("---------------------------");
  ctx.log("");

  gh_client.getLegacyParentTeam(config.org).then(function(parentTeam) {
    gh_client.getOrgTeams(config.org).then(function(teams) {
      //only move teams which does not start with Team
      config.teams = teams.filter(x => {
        if (
          x.parent ||
          x.name.indexOf("Team ") > -1 ||
          _ignoreTeams.indexOf(x.name) > -1
        ) {
          return false;
        }

        return true;
      });

      //limit to 50 to avoid disaster
      config.teams = config.teams.slice(0, 50);

      gh_client.moveTeam(config.teams, parentTeam.id).then(function() {
        config = {};
        cb();
      });
    });
  });
};

module.exports = function(config) {
  trafficLightConfig = config;
  client = require("../client")(trafficLightConfig);
  gh_client = github(trafficLightConfig.credentials);

  return function(ctx, args, cb) {
    askForProjectDetails(ctx, args, cb);
  };
};
