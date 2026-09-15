# Contributing to Janos

Thank you for your interest in improving Janos! We welcome contributions, bug fixes, feature requests, and new migration rules for upcoming Kubernetes releases.

## Code of Conduct

We want to foster an inclusive and friendly community. This project adheres to the Contributor Covenant Code of Conduct. Please [read it and follow it](CODE_OF_CONDUCT.md).

If you experience any issues or wish to report a Code of Conduct violation, please reach out to [Pablo Loschi](mailto:loschi.pablo@gmail.com).

## How to Contribute

### Submitting an Issue
1. Search existing issues on GitHub to verify your issue or feature proposal hasn't already been reported.
2. Open a new issue with a clear title and description.
3. If reporting a migration bug, please provide:
   - Input Kubernetes YAML manifest
   - Expected output manifest
   - Janos CLI command used and version (`janos --version`)

### Submitting a Pull Request
1. Fork the repository and create a feature branch:
   ```sh
   git checkout -b feature/my-k8s-migration
   ```
2. Install dependencies and run tests:
   ```sh
   npm install
   npm test
   ```
3. Add your changes with corresponding automated tests in `src/*.spec.js` or `src/*.test.js`.
4. Ensure all tests pass (`npm test`).
5. Open a Pull Request with a descriptive summary of your changes.

---

### Maintainer
- **Pablo Loschi** - [loschi.pablo@gmail.com](mailto:loschi.pablo@gmail.com)
