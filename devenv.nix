{ pkgs, ... }:
{
  # Toolchain only. Vite+ needs Node >= 22.18 (root package.json engines).
  # gitleaks scans staged changes (pre-commit hook) and the full history (CI) for secrets; its
  # rules live in .gitleaks.toml. The git hooks and CI resolve every tool (vp, gitleaks,
  # commitlint) from this shell's PATH, so they run in the same pinned toolchain.
  packages = [
    pkgs.bun
    pkgs.nodejs_24
    pkgs.gitleaks
  ];
}
