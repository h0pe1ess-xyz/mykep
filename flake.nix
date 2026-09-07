{
  description = "MyKep FastAPI Backend Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.python311
            pkgs.python311Packages.pip
            pkgs.python311Packages.venvShellHook
          ];

          venvDir = "./.venv";

          postShellHook = ''
            echo "Встановлюємо залежності Python..."
            pip install fastapi uvicorn aiosqlite cloudscraper chompjs
            echo "Середовище готове! Запустіть: python main.py"
          '';
        };
      }
    );
}
