# Mulesoft Deploy Action

A GitHub Action that downloads the specified release artifact from the GitHub repository and uploads it to the Mulesoft Cloudhub runtime environment.

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


## License

This code is made available under the MIT license.

