# Awilix Helper

LSP support for [Awilix](https://github.com/jeffijoe/awilix) dependency injection in plain JavaScript projects.

## Features

Provides IntelliSense and navigation for Awilix containers in JavaScript projects without TypeScript:

### Go to Definition
Jump to where dependencies are registered in the container.

- **From `container.resolve('key')`** - Navigate to registration
- **From `container.cradle.key`** - Navigate to registration
- **From constructor parameters** - Navigate directly from `constructor({myService})` to where `myService` is registered

![Go to Definition Demo](https://raw.githubusercontent.com/your-username/awilix-helper/main/images/goto-definition.gif)

### Auto-completion
Intelligent suggestions for registered keys.

- Inside `container.resolve('...')`
- After `container.cradle.`
- Inside constructor destructuring: `constructor({...})`

![Autocomplete Demo](https://raw.githubusercontent.com/your-username/awilix-helper/main/images/autocomplete.gif)

### Hover Information
Rich documentation on hover showing:
- Dependency kind (class, function, value)
- Lifetime (singleton, scoped, transient)
- Source file path
- Export name

![Hover Demo](https://raw.githubusercontent.com/your-username/awilix-helper/main/images/hover.gif)

### Diagnostics
Real-time error detection for:
- Unregistered keys in `resolve()` calls
- Missing dependencies in constructor parameters
- Invalid cradle property access

![Diagnostics Demo](https://raw.githubusercontent.com/your-username/awilix-helper/main/images/diagnostics.gif)

## Usage

The extension automatically activates when you open a JavaScript project.

### Example

```javascript
// container.js
const awilix = require('awilix');

const container = awilix.createContainer();

container.register({
  userService: awilix.asClass(UserService).singleton(),
  logger: awilix.asValue(console),
  config: awilix.asValue({ port: 3000 })
});

module.exports = container;
```

```javascript
// user-controller.js
class UserController {
  constructor({userService, logger}) {
    //          ^ Ctrl+Click to jump to registration
    //          ^ Hover to see: class (singleton)
    //          ^ Auto-complete suggests: userService, logger, config
    this.userService = userService;
    this.logger = logger;
  }
}
```

## Commands

- **Awilix: Show Index Status** - View all registered keys and statistics

## Configuration

```json
{
  "awilixHelper.indexIgnore": [
    "**/node_modules/**",
    "**/dist/**"
  ],
  "awilixHelper.registerContainerNames": [
    "container"
  ]
}
```

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `awilixHelper.indexIgnore` | Glob patterns to ignore during indexing | `["**/node_modules/**", "**/dist/**", "**/out/**", "**/.git/**"]` |
| `awilixHelper.registerContainerNames` | Container variable names to track | `["container"]` |
| `awilixHelper.loadModulesGlobs` | Glob patterns for loadModules expansion | `["src/**/*.js"]` |
| `awilixHelper.generateCradleFile` | Generate awilix-cradle.js with JSDoc typedefs | `false` |

## Requirements

- VS Code 1.80.0 or higher
- JavaScript project using Awilix

## Known Limitations

- Only supports JavaScript (not TypeScript, at the moment)
- Detects `container.register()` patterns only
- Does not support dynamic key generation

## Contributing

Contributions are welcome! Please visit the [GitHub repository](https://github.com/your-username/awilix-helper).

## License

MIT

## Release Notes

### 0.0.4

Stable release:
- Update forced due to problems with ther marketplace

### 0.0.3

Critical fix:
- Fixed extension not activating when installed from VSIX
- Included required dependencies in packaged extension (Babel, fast-glob)

### 0.0.2

Bug fixes and improvements:
- Fixed go-to-definition inside `resolve()` string literals
- Improved auto-completion within `resolve()` calls
- Excluded test files from indexing to prevent duplicate key conflicts
- Better detection of Awilix registration patterns with chained methods

### 0.0.1

Initial release:
- Go to definition support
- Auto-completion for registered keys
- Hover information with metadata
- Diagnostics for unregistered keys
- Constructor parameter injection support
