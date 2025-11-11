# Contributing Third-Party Apps to Mentra OS

Welcome to the Mentra OS open source community! We're excited to have you contribute to building robust third-party applications for our smart glasses platform.

**IMPORTANT:** All contributions must build on top of the **official mentraOS API**. This ensures your third-party app maintains compatibility and stability with the mentraOS ecosystem. Please familiarize yourself with the mentraOS API documentation before contributing.

## Branch Structure & Workflow

Our project follows a three-stage deployment pipeline to ensure quality and stability:

```
community → dev → production
```

### Branch Descriptions

1. **`community`** - Community contributions branch
   - All external contributors submit pull requests here
   - This is where new features and improvements are first reviewed
   - Requires approval from maintainers before merging

2. **`dev`** - Development branch
   - Approved community contributions are merged here
   - Internal development and testing occurs here
   - Integration testing with other features
   - Final quality assurance and user acceptance testing

3. **`production`** - Live branch
   - Stable, production-ready code
   - Used by all Mentra OS users
   - Only fully tested and approved features make it here

## How to Contribute

### 1. Clone the App

```bash
# Clone the repository
git clone https://github.com/Mentra-Community/<appname>
cd <appname>
```

### 2. Create a Feature Branch

```bash
# Make sure you're starting from the community branch
git checkout community
git pull upstream community

# Create your feature branch
git checkout -b feature/your-feature-name
```

### 3. Make Your Changes

- Write clean, well-documented code
- Follow the project's coding standards
- Add tests for new features
- Update documentation as needed

### 4. Test Your Changes

```bash
# Test on device if possible
bun run dev
```

### 5. Commit Your Changes

```bash
git add .
git commit -m "Brief description of your feature"
```

### 6. Push and Create Pull Request

```bash
# Push to your fork
git push origin feature/your-feature-name
```

Then:
1. Go to GitHub and create a Pull Request
2. **Target the `community` branch** (not `dev` or `main`)
3. Fill out the PR template with:
   - Description of changes
   - Why this feature is needed
   - Testing performed
   - Screenshots/videos if applicable

### 7. Review Process

1. **Community Review** - Maintainers review your PR
2. **Approval** - Once approved, your PR is merged into `community`
3. **Testing Pipeline** - Your feature goes through automated testing
4. **Dev Integration** - Merged into `dev` for integration testing and final QA
5. **Production** - Finally deployed to `production` for all users

## Pipeline Flow Diagram

```
┌─────────────┐
│   Your PR   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  community  │ ◄── All contributors submit here
└──────┬──────┘
       │ (approved & merged)
       ▼
┌─────────────┐
│     dev     │ ◄── Integration, development testing & QA
└──────┬──────┘
       │ (tested & stable)
       ▼
┌─────────────┐
│     main    │ ◄── Live for all users
└─────────────┘
```

## What to Contribute

We welcome contributions in these areas:

- **New Features** - Voice commands, AI agents, tools, integrations (must use official mentraOS API)
- **Bug Fixes** - Help us squash bugs and improve stability
- **Performance** - Optimize code for better battery life and speed
- **Documentation** - Improve guides, add examples, fix typos
- **Tests** - Increase test coverage and reliability
- **UI/UX** - Enhance user interface and experience

**Remember:** All features must be built on top of the official mentraOS API to ensure compatibility and long-term maintainability.

## Code Standards

- Use TypeScript for type safety
- Follow existing code formatting (use Prettier)
- Write meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Write tests for new features

## Getting Help

- **Discord** - Join our community Discord for real-time help: https://discord.com/invite/5ukNvkEAqT
- **GitHub Issues** - Search existing issues or create a new one at https://github.com/Mentra-Community/<appname>
- **Documentation** - Check our docs at https://docs.mentraglass.com/
- **Website** - Visit https://mentraglass.com/
- **Email** - Contact the team at team@mentraglass.com


## License

By contributing to Mentra OS, you agree that your contributions will be licensed under the same license as the project.

---

**Thank you for contributing to Mentra OS and helping make smart glasses better for everyone!** 🚀
