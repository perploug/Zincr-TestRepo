var client,
  trafficLightConfig,
  gh_client,
  github = require("../github"),
  utill = require("./utill");

//config for this task
var config = {
  url: ""
};

var askForProjectDetails = function(ctx, args, cb) {
  ctx.log("Scan repository before incubation ");
  ctx.log("---------------------------");
  ctx.log("");

  if (args.url) {
    config.url = args.url;
  }

  ctx.prompt(
    [
      {
        type: "input",
        name: "url",
        message: "repository git url?:   ",
        when: function() {
          return !config.url;
        }
      }
    ],
    function(answers) {
      config = { ...config, ...answers };

      scan(ctx, cb);
    }
  );
};

var scan = function(ctx, cb) {
  console.log(config);
  client.scan(config.url).then(function() {
    console.log("############  Repository scanned  #########");
    config = {};

    cb();
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
