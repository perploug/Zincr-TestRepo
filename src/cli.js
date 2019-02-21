const vorpal = require("vorpal")();
const _trafficLightConfigFile = require("../.trafficlight");
const utill = require("./cli-tasks/utill");
const github = require("./github")(_trafficLightConfigFile.credentials);

github.getUserOrgs().then(function(orgs) {
  _trafficLightConfigFile.organisations = orgs.map(x => x.login).sort();

  //Tasks
  const create = require("./cli-tasks/create")(_trafficLightConfigFile);
  const migrate = require("./cli-tasks/migrate")(_trafficLightConfigFile);
  const validate = require("./cli-tasks/validate")(_trafficLightConfigFile);
  const maintainers = require("./cli-tasks/maintainers")(
    _trafficLightConfigFile
  );
  const branchProtection = require("./cli-tasks/branchprotection")(
    _trafficLightConfigFile
  );

  const teams = require("./cli-tasks/team")(_trafficLightConfigFile);
  const scan = require("./cli-tasks/scan")(_trafficLightConfigFile);

  vorpal.command("create [repo]").action(function(args, cb) {
    create(this, args, cb);
  });

  vorpal.command("migrate [repo]").action(function(args, cb) {
    migrate(this, args, cb);
  });

  vorpal.command("validate [repo]").action(function(args, cb) {
    validate(this, args, cb);
  });

  vorpal.command("scan [url]").action(function(args, cb) {
    scan(this, args, cb);
  });

  vorpal.command("maintainers [repo]").action(function(args, cb) {
    maintainers(this, args, cb);
  });

  vorpal.command("protect [repo]").action(function(args, cb) {
    branchProtection(this, args, cb);
  });

  vorpal.command("teams [org]").action(function(args, cb) {
    teams(this, args, cb);
  });

  //Display start-up message
  utill.welcome();

  vorpal.delimiter(" 🚦 > ").show();
});
