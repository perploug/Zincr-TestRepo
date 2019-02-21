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
  ctx.log("Branch protection for repos");
  ctx.log("---------------------------");
  ctx.log("");

  if (args.repo) {
    config = utill.parseRepositoryString(args.repo);
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
      },
      {
        type: "input",
        name: "repo",
        message: "Specific repository to config?:   ",
        when: function() {
          return !config.repo;
        }
      }
    ],
    function(answers) {
      config = { ...config, ...answers };
      config.repos = [];

      queryRepositories(ctx, cb);
    }
  );
};

var queryRepositories = function(ctx, cb) {
  ctx.log("Querying repositories");
  ctx.log("---------------------------");
  ctx.log("");

  if (config.repo) {
    configureBranchProtection(config.org, config.repo).then(function() {
      config = {};
      cb();
    });
  } else {
    gh_client.getRepos(config.org).then(function(repos) {
      config.repos = repos;

      var result = config.repos.map(x => {
        return configureBranchProtection(config.org, x.name);
      });

      Promise.all(result).then(function(result) {
        config = {};
        cb();
      });
    });
  }
};

//make the branch protection zappr compatible
var configureBranchProtection = function(org, repo) {
  return gh_client.protectBranch(org, repo, "master");
};

module.exports = function(config) {
  trafficLightConfig = config;
  client = require("../client")(trafficLightConfig);
  gh_client = github(trafficLightConfig.credentials);

  return function(ctx, args, cb) {
    askForProjectDetails(ctx, args, cb);
  };
};
