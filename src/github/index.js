const octokit = require("@octokit/rest")();

var getRepoCollaborators = async function(org, repo, affiliation = "all") {
  const collabs = await octokit.repos.getCollaborators({
    owner: org,
    repo: repo,
    affiliation: affiliation,
    per_page: 100,
    page: 1
  });
  return collabs.data;
};

var getUserOrgs = async function() {
  const orgs = await octokit.users.getOrgs({ per_page: 100, page: 1 });
  return orgs.data;
};

var getRepo = async function(org, repo) {
  const result = await octokit.repos.get({ owner: org, repo: repo });
  return result.data;
};

var getRepos = async function(org) {
  const result = await octokit.repos.getForOrg({
    org: org,
    per_page: 100,
    page: 1
  });

  return result.data;
};

var getUser = async function(username) {
  try {
    const result = await octokit.users.getForUser({ username });
    return result.data;
  } catch (e) {
    return null;
  }
};

var getBranchProtection = async function(org, repo, branch) {
  try {
    const result = await octokit.repos.getBranchProtection({
      owner: org,
      repo: repo,
      branch: branch,
      headers: {
        accept: "application/vnd.github.luke-cage-preview+json"
      }
    });
    return result.data;
  } catch (e) {
    return undefined;
  }
};

var getCommunityMetrics = async function(org, repo) {
  const metrics = await octokit.repos.getCommunityProfileMetrics({
    owner: org,
    name: repo
  });
  return metrics.data;
};

// returns a string array of all maintainer logins on
// all teams that have write or admin access to the repo
var getRepoMaintainers = async function(org, repo, ignoreOwners = true) {
  let teams = await getRepoTeams(org, repo);
  const maintainers = [];

  if (ignoreOwners) {
    teams = teams.filter(x => x.name !== "Team " + repo);
  }

  for (const team of teams) {
    if (team && (team.permission === "admin" || team.permission === "push")) {
      const members = await octokit.orgs.getTeamMembers({ id: team.id });
      for (const member of members.data) {
        maintainers.push(member);
      }
    }
  }

  return maintainers;
};

// Requires the ID of the old and new team - members are not removed from the old team
var migrateTeamMembers = async function(oldTeamId, newTeamId) {
  const members = await octokit.orgs.getTeamMembers({ id: oldTeamId });
  for (const member of members.data) {
    await octokit.orgs.addTeamMembership({
      id: newTeamId,
      username: member.login,
      role: "maintainer"
    });
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

var _moveTeam = async function(team, newParentTeamId, privacy = "closed") {
  return octokit.orgs.editTeam({
    id: team.id,
    name: team.name,
    privacy: privacy,
    parent_team_id: newParentTeamId
  });
};
// Requires a team object with atleast id and name on it, newParentTeamId is an int
var moveTeam = async function(team, newParentTeamId, privacy = "closed") {
  try {
    if (!Array.isArray(team)) {
      var result = await_moveTeam(team, newParentTeamId, privacy);
      console.log(result);
    } else {
      for (let i = 0; i < team.length; i++) {
        const result = await _moveTeam(team[i], newParentTeamId, privacy);
        console.log(result.data.name + " moved");
      }
    }
  } catch (ex) {
    console.error(team.name + " could not be moved");
  }
};

var removeRepoFromTeam = async function(team, org, repo) {
  return await octokit.orgs.deleteTeamRepo({
    id: team.id,
    owner: org,
    repo: repo
  });
};

var getRepoTeams = async function(org, repo) {
  const teams = await octokit.repos.getTeams({ owner: org, repo: repo });
  return teams.data;
};

// this is truly a hack to speed up parent team look-ups
//otherwise we would have to iterate throug all team of the entire org every time
var getLegacyParentTeam = async function(org) {
  if (org === "zalando-incubator") {
    var team = await octokit.orgs.getTeam({ id: 2849483 });
    return team.data;
  }

  if (org === "zalando") {
    var team = await octokit.orgs.getTeam({ id: 2849561 });
    return team.data;
  }

  return await findTeam(org, "Legacy Teams");
};

var getProjectsParentTeam = async function(org) {
  if (org === "zalando-incubator") {
    var team = await octokit.orgs.getTeam({ id: 2849476 });
    return team.data;
  }

  if (org === "zalando") {
    var team = await octokit.orgs.getTeam({ id: 2849559 });
    return team.data;
  }

  return await findTeam(org, "Project Teams");
};

var getOrgTeams = async function(org) {
  var _fetch = async function(teams, page = 0, per_page = 100) {
    const val = await octokit.orgs.getTeams({ org, page, per_page });
    teams = teams.concat(val.data);

    if (val.data.length === per_page) {
      return _fetch(teams, page + 1);
    } else {
      return teams;
    }
  };

  var teams = [];
  teams = await _fetch(teams);

  return teams;
};

var findTeam = async function(org, team) {
  const teams = await octokit.orgs.getTeams({ org });

  for (const t of teams.data) {
    if (t.name === team) {
      return t;
    }
  }

  return null;
};

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

var createRepoTeam = async function(org, repo, parentTeam, maintainers = null) {
  try {
    // convert the list of maintainers to github logins
    var mainTainerGithubNames = maintainers
      ? maintainers.map(x => x.login).filter(onlyUnique)
      : [];

    var data = {
      org: org,
      name: "Team " + repo,
      description: `Maintainers of the ${repo} project`,
      maintainers: mainTainerGithubNames,
      repo_names: [`${org}/${repo}`],
      privacy: "closed",
      permission: "push",
      headers: {
        accept: "application/vnd.github.hellcat-preview+json"
      }
    };

    var parentTeam = await getProjectsParentTeam(org);

    if (parentTeam) {
      data.parent_team_id = parentTeam.id;
    }

    //create team and assign maintainers
    var result = await octokit.orgs.createTeam(data);

    return result;
  } catch (e) {
    console.error("Could not create team");
    console.error(e);
    throw e;
  }
};

var createRepo = async function(org, repo, description) {
  //create repo
  var result;

  try {
    result = await octokit.repos.createForOrg({
      org: org,
      name: repo,
      description: description,
      homepage: "",
      private: false,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
      auto_init: true,
      license_template: "mit",
      allow_squash_merge: true,
      allow_merge_commit: true,
      allow_rebase_merge: true
    });
  } catch (e) {
    console.error("Could not create repository");
    console.error(e);

    // If the error isnt about the repo already existing, we will stop the entire process
    if (e.code !== 422) {
      throw e;
    }
  }

  return result;
};

var branchAdminEnforcement = async function(org, repo, branch = "master") {
  const result = await octokit.repos.addProtectedBranchAdminEnforcement({
    owner: org,
    repo: repo,
    branch: branch
  });
};

var protectBranch = async function(org, repo, branch = "master") {
  try {
    var contexts = [];

    var currentProtection = await getBranchProtection(org, repo, branch);
    if (currentProtection && currentProtection.required_status_checks) {
      contexts = currentProtection.required_status_checks.contexts;
    }

    // We need to ensure that repos with a ZappR Webhook has zappr status checks on by default.
    const currentHooks = await octokit.repos.getHooks({
      owner: org,
      repo: repo
    });
    var hasZapprHooks =
      currentHooks.data.filter(
        x => x.url.indexOf("zappr.opensource.zalan.do") > -1
      ).length > 0;

    if (hasZapprHooks && contexts.indexOf("zappr") === -1) {
      contexts.push("zappr");
    }

    if (hasZapprHooks && contexts.indexOf("zappr/pr/specification") === -1) {
      contexts.push("zappr/pr/specification");
    }

    await octokit.repos.updateBranchProtection({
      owner: org,
      repo: repo,
      branch: branch,

      required_status_checks: {
        strict: true,
        contexts: contexts
      },

      required_pull_request_reviews: {
        require_code_owner_reviews: true,
        required_approving_review_count: 1,
        dismissal_restrictions: { users: [], teams: [] },
        dismiss_stale_reviews: false
      },

      enforce_admins: true,
      restrictions: null,
      headers: {
        accept: "application/vnd.github.luke-cage-preview+json"
      }
    });

    return true;
  } catch (e) {
    console.error("Could not set review and protection settings");
    console.error(e);
    throw e;
  }
};

const createIssue = async function(owner, repo, title, body) {
  var result;

  try {
    result = await octokit.issues.create({
      owner,
      repo,
      title,
      body
    });
  } catch (e) {
    console.error("Could not create issue", e);
    return e;
  }

  return result;
};

var ex = function(credentials) {
  octokit.authenticate({
    type: "token",
    token: credentials.token
  });

  return {
    _gh: octokit,
    createRepo,
    createRepoTeam,
    findTeam,
    getRepo,
    getRepos,
    getCommunityMetrics,
    getBranchProtection,
    getRepoTeams,
    getOrgTeams,
    getLegacyParentTeam,
    getProjectsParentTeam,
    getRepoMaintainers,
    getRepoCollaborators,
    getUser,
    getUserOrgs,
    moveTeam,
    removeRepoFromTeam,
    migrateTeamMembers,
    protectBranch,
    createIssue
  };
};

module.exports = ex;
