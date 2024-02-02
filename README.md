# MuleSoft Deploy Action

A GitHub Action that downloads the specified release artifact from the GitHub repository and uploads it to the MuleSoft CloudHub runtime environment.

## Usage

Add the following steps in your workflow:

```
      - uses: invitation-homes/mulesoft-deploy-action@main
        with:
          release-tag: "1.0.0"
          cloudhub-env: "dev"
          cloudhub-app-name: "salesforce-marketing-cloud-dev"
        env:
          GITHUB_TOKEN: ${{secrets.GITHUB_TOKEN}}
          CLOUDHUB_USER: ${{secrets.MULESOFT_DEPLOY_USERNAME }}
          CLOUDHUB_PASSWORD: ${{secrets.MULESOFT_DEPLOY_PASSWORD }}
```

## Building

When updating this GitHub action to add functionality or fix an issue:

1. Make the necessary changes in `index.js`
1. Run `yarn && yarn build` to build a new `dist/index.js` file
1. Commit both files

## License

This code is made available under the MIT license.
