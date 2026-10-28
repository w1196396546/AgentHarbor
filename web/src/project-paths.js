// UI identity only. The desktop client still authorizes every filesystem request.
export function normalizeProjectPath(value) {
  let path = String(value || "").replaceAll("\\", "/");
  if (/^\/\/\?\/unc\//i.test(path)) path = "//" + path.slice(8);
  else if (/^\/\/\?\/[a-z]:\//i.test(path)) path = path.slice(4);
  path = path.replace(/\/+$/, "");
  if (!path && value) path = "/";
  if (/^[a-z]:$/i.test(path) && /[\\/]$/.test(value)) path += "/";
  return path;
}

export function isWindowsProjectPath(value) {
  const path = normalizeProjectPath(value);
  return /^[a-z]:\//i.test(path) || /^\/\/(?![?.]\/)[^/]+\/[^/]+/.test(path);
}

export function projectPathKey(value) {
  const path = normalizeProjectPath(value);
  if (/(^|\/)\.\.(\/|$)/.test(path)) return "";
  return isWindowsProjectPath(path) ? path.toLowerCase() : path;
}

export function sameProjectPath(left, right) {
  const key = projectPathKey(left);
  return !!key && key === projectPathKey(right);
}

export function projectContainsPath(root, value) {
  const parent = projectPathKey(root),
    child = projectPathKey(value);
  return (
    !!parent &&
    !!child &&
    (parent === child ||
      child.startsWith(parent.endsWith("/") ? parent : parent + "/"))
  );
}

export function owningProject(projects, cwd) {
  return (
    projects
      .filter((root) => projectContainsPath(root, cwd))
      .sort(
        (left, right) =>
          projectPathKey(right).length - projectPathKey(left).length,
      )[0] || ""
  );
}

export function selectableProjects(projects, nativeProjects) {
  return (nativeProjects || []).flatMap((project) => {
    const root = project.root_paths?.find((path) =>
      projects.some((shared) => sameProjectPath(shared, path)),
    );
    return root ? [{ ...project, root_paths: [root, ...project.root_paths.filter((path) => !sameProjectPath(root, path))] }] : [];
  });
}

export function sessionProject(projects, sidebarProjects, session) {
  if (session?.projectless === true) return session.cwd || "";
  const project = sidebarProjects?.find(
    (project) => project.id === session?.project_id,
  );
  return (
    project?.root_paths?.find((root) =>
      projects.some((shared) => sameProjectPath(shared, root)),
    ) || owningProject(projects, session?.cwd)
  );
}
