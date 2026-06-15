# Use Node Built-In SQLite for MVP Storage

The MVP will use Node's built-in `node:sqlite` module for the first SQLite storage implementation. This avoids adding a native npm SQLite binding that would need Electron-specific rebuild and packaging work during the early desktop workflow phase.

The trade-off is that `node:sqlite` currently emits an experimental stability warning in the Node runtime used for development, so this choice should remain isolated behind the task repository boundary. If Electron packaging or runtime stability makes the built-in module unsuitable, the repository layer can be moved to another SQLite binding without changing renderer or workflow code.
