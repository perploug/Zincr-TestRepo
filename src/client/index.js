var github = require("../github");
var utill = require("../utill");
const git = require("../git");
var compliance = require("../compliance");
const { LicenseLookup } = require("license-lookup");
const Rc = require("@hawkeyesec/scanner-cli/lib/rc");
const scan = require("@hawkeyesec/scanner-cli/lib/scan");
const fs = require("fs");

var config = {
  boilerplate: {
    org: "zalando-incubator",
    repo: "new-project"
  },
  teams: {
    projectsTeamName: "Project Teams",
    legacyTeamName: "Legacy Teams",
    nameTemplate: "Team {0}"
  },

  tmpFolder: __dirname + "/../.tmp",
  maintainers: []
};

// we need to clean up before we start working
var init = function() {
  utill.rmdir(config.tmpFolder);
  utill.mkdir(config.tmpFolder);
};

var scanRepositoryUrl = async function(url) {
  const _dir = config.tmpFolder + "/scan/";
  utill.rmdir(_dir);
  const git_client = git(config.credentials, config.tmpFolder);
  await git_client.cloneRepoFromUrl(url, "scan");
  utill.rmdir(_dir + ".git");

  const files = fs.readdirSync(_dir);
  const scanResult = [];

  const rc = new Rc();
  rc.target = "src/.tmp/scan";
  //rc.withJson(__dirname + "/security.json");
  await scan(rc);

  var ll = new LicenseLookup();
  var matches = ll.matchFilesToManager(files);
  for (const m of matches) {
    const manifest = fs.readFileSync(_dir + m.file).toString();
    const detected = await m.manager.detect(manifest);
    const licensed = await m.manager.lookup(detected);

    console.log(
      licensed.filter(x => x.found).length + " dependencies found in: " + m.file
    );
    for (const lic of licensed.filter(x => x.found)) {
      console.log(
        `Dependency: ${lic.name}, License: ${lic.license}, Url: ${lic.url}`
      );
    }
  }
};

var createNewRepository = async function(
  org,
  repo,
  description,
  maintainers,
  url
) {
  // connect to github and git
  const gh_client = github(config.credentials);
  const git_client = git(config.credentials, config.tmpFolder);

  //create repository and connect a maintainer team to it
  await gh_client.createRepo(org, repo, description);

  //setup the team and associate the repository
  await gh_client.createRepoTeam(
    org,
    repo,
    config.teams.projectsTeamName,
    maintainers
  );

  // clone project and boilerplate file repo
  await git_client.cloneRepo(org, repo);

  if (config.boilerplate.org && config.boilerplate.repo) {
    await git_client.cloneRepo(config.boilerplate.org, config.boilerplate.repo);

    //delete the .git folder to avoid it being copied over during the file sync
    utill.rmdir(`${config.tmpFolder}/${config.boilerplate.repo}/.git`);

    // replace common project values in all the files included in the boiler plate
    utill.templateFiles(
      { name: repo, org, maintainers, description },
      `${config.tmpFolder}/${config.boilerplate.repo}`
    );

    // copy files from boilerplate into the new repo
    utill.copyDir(
      `${config.tmpFolder}/${config.boilerplate.repo}`,
      `${config.tmpFolder}/${repo}`
    );
  }

  // if a url is provided, we will clone down the repo and add its files ontop of the
  // boilerplate so everything is transfered automatically

  if (url) {
    await git_client.cloneRepoFromUrl(url, repo + "_base");
    utill.rmdir(`${config.tmpFolder}/${repo}_base/.git`);

    utill.copyDir(
      `${config.tmpFolder}/${repo}_base`,
      `${config.tmpFolder}/${repo}`
    );
  }

  // commit and push the files from the boilerplate
  await git_client.commitAndPushRepo(org, repo);

  // after this intial commit, lock down the branch
  gh_client.protectBranch(org, repo);

  // create first issue
  const rootPath = "../blob/master/";
  const issueTitle = "To-dos";
  const issueBody = `
- [ ] [CONTRIBUTING.md](${rootPath}CONTRIBUTING.md) updated
- [ ] [CONTRIBUTORS.md](${rootPath}CONTRIBUTORS.md) updated with names of external contributors
- [ ] [CODEOWNERS](${rootPath}.github/CODEOWNERS) updated with usernames of who review which PRs
- [ ] [MAINTAINERS](${rootPath}MAINTAINERS) updated with team member contact info
- [ ] [CODE_OF_CONDUCT.md](${rootPath}CODE_OF_CONDUCT.md) reviewed
- [ ] [SECURITY.md](${rootPath}SECURITY.md) reviewed
- [ ] [Pull request template](${rootPath}.github/PULL_REQUEST_TEMPLATE.md) reviewed
- [ ] [Issue template](${rootPath}.github/ISSUE_TEMPLATE.md) reviewed
- [ ] [Readme](${rootPath}README.md) updated 
  `;
  await gh_client.createIssue(org, repo, issueTitle, issueBody);

  console.log("All done");
};

var validateRepository = async function(org, repo) {
  var compliance_client = compliance(config);
  var options = {
    allowUncaught: true,
    fullStackTrace: false,
    hideDiff: true,
    noHighlighting: true,
    useInlineDiffs: false
  };
  await compliance_client.runTests(org, repo, options);
};

var migrateRepository = async function(org, repo) {
  // connect to github and git
  const gh_client = github(config.credentials);

  // get current repo maintainers - members of teams with admin or write access
  const maintainers = await gh_client.getRepoMaintainers(org, repo, true);

  // get current repo teams - also read-only teams
  const teams = await gh_client.getRepoTeams(org, repo);

  // determine if there is already a ownership team:
  const ownerTeam = teams.find(x => x.name === "Team " + repo);

  // if there is an existing owner-team - stop the process

  if (ownerTeam) {
    throw "Repository already have a maintainers team";
  }

  // get legacy team for migrating all legacy teams to for manual inspection
  var legacyParentTeam = await gh_client.getLegacyParentTeam(org);
  var projectParentTeam = await gh_client.getProjectsParentTeam(org);

  if (!legacyParentTeam) {
    throw "Legacy parent team could not be found";
  }

  if (!projectParentTeam) {
    throw "Project parent team could not be found";
  }
  //create a new team and add the maintainers to it
  await gh_client.createRepoTeam(
    org,
    repo,
    config.teams.projectsTeamName,
    maintainers
  );

  //move the old teams under the legacy teams team and remove the repo from the team
  for (const team of teams) {
    if (team.permission !== "pull") {
      await gh_client.removeRepoFromTeam(team, org, repo);
    }

    try {
      await gh_client.moveTeam(team, legacyParentTeam.id);
    } catch (ex) {
      //This can happen - but we do not want to stall the process
    }
  }

  // protect the master branch and enforce codeowner reviews
  await gh_client.protectBranch(org, repo);
};

init();

module.exports = function(cfg) {
  config = { ...cfg, ...config };

  //todo - this needs to be configurable and not depend on a file
  if (!config.credentials || !config.credentials.token) {
    throw "Github credentials not available, create a .trafficlight.js file to configure";
  }

  return {
    migrate: migrateRepository,
    create: createNewRepository,
    validate: validateRepository,
    scan: scanRepositoryUrl
  };
};
