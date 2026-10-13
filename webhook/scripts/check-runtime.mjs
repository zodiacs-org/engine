const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 22 || minor < 13) {
  console.error("The webhook workbench requires Node 22.13 or later in the Node 22 release line.");
  process.exitCode = 1;
}
