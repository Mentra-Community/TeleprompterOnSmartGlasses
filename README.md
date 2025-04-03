# Teleprompter

### Docker and Production Setup

#### Primary: GitHub Actions + Submodules (for Porter)
When building through GitHub Actions (Porter deployment):
- The submodule is explicitly initialized with `submodules: 'recursive'`
- All FrequencyWords files are included directly in the Docker image
- No runtime downloads needed

#### Fallback: Runtime Downloads (for manual builds)
If the Docker image is built manually without submodule initialization:
- Base directories are created during build
- Our startup script checks for missing files
- Any missing files are downloaded at runtime using Node.js
- No external tools required (uses built-in https module)

### GitHub Actions Workflow for Porter

Our Porter deployments use GitHub Actions with proper submodule handling:

```yaml
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code with submodules
        uses: actions/checkout@v3
        with:
          submodules: 'recursive'  # This ensures FrequencyWords is properly fetched
      
      # Build and push to registry, then deploy to Porter
```

The workflow is designed to:
1. Properly fetch all FrequencyWords files during checkout
2. Include them in the Docker image during build
3. Ensure no runtime downloads are needed in production
