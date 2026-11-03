# Issue tracker: GitHub

Issues and specs live in this repo's GitHub Issues. Use the `gh` CLI.

## Conventions

- Create: `gh issue create --title "..." --body "..."`. Use a heredoc for multiline bodies.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments` with appropriate `--label` and `--state` filters.
- Sub-issues: `gh issue create --parent <parent> ...` or `gh issue edit <parent> --add-sub-issue <child>` (gh 2.94+). On older gh, use `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`. If unavailable, put `Part of #<parent>` in the child body.
- Blocking: use GitHub's native dependencies with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>` (gh 2.94+). On older gh, use `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Database IDs come from `gh api repos/<owner>/<repo>/issues/<n> --jq .id`, not the issue number or node ID. If unavailable, put `Blocked by: #<n>, #<n>` in the child body. A ticket is unblocked when all blockers are closed.
- Count open blockers: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by`. Alternatively, use `gh issue view <n> --json blockedBy --jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- Comment: `gh issue comment <number> --body "..."`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post the explanation with `gh issue comment`, then `gh issue close <number>`. On an already-closed issue, `gh issue close --comment` can drop the comment.

`gh` infers the repo from the remote. File issues only in the user's own repo; before the first creation in a session, check `gh repo view --json nameWithOwner` and confirm if it is not their repo.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if external PRs should be triaged as requests.

When enabled, use `gh pr view <number>`, `gh pr view <number> --comments`, and `gh pr diff <number>` to read a PR; use `gh pr comment`, `gh pr edit`, and `gh pr close` to act. List external PRs with:

    gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'

Issues and PRs share a number space. Resolve a bare number with `gh pr view`, falling back to `gh issue view`.

## Skill operations

- Publish to the issue tracker: create a GitHub issue.
- Fetch the relevant ticket: read it as above.
- `/wayfinder`: use an issue labelled `wayfinder:map` as the map and sub-issues as tickets. If sub-issues are unavailable, use a task list in the map and `Part of #<map>` in each child. Label children `wayfinder:<type>` (`research`, `prototype`, `grilling`, or `task`). Choose the first open child in map order without an open blocker or assignee; claim it with `gh issue edit <n> --add-assignee @me`. Resolve it by commenting with the answer, closing it, and appending a context pointer to the map.
