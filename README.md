# gas-report-action

A Github Action that takes the result from `eth-gas-reporter` (https://github.com/cgewecke/eth-gas-reporter), parses it and creates a comment in the Pull Request (if any) with a gas usage report for each method of the tested contracts, also shows the variation of the average of each method compared to the last results from this action.

It also passes the value as an output of the step in `parsed_gas_report` as an array-like structure with elements following the schema `{ Contract: 'string', Method: 'string', Min: number, Max: number, Avg: number }`. Note: This output does not contain the variation of the average since the last run.

## Usage 

```
name: Comment gas report in PR

on: push
    
jobs:
  build:
    steps:
    - uses: actions/checkout@v2
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v2
    - run: npm i
    - run: CI=true truffle test  # When CI environment variable is set to true eth-gas-reporter will create a 'gasReporterOutput.json' file
    - name: Generate gas usage report
      id: gas_report
      uses: santiac89/gas-report-action@latest
      with:
        token: ${{ secrets.GITHUB_TOKEN }} # Required to publish comment, if not present only the output 'parsed_gas_report' of the step will be present
        contracts: TestContract # String of comma-separated contract names to include in the report
        report_file: './gasReporterOutput.json' # Default if not specified

```
## Example result in comment

<h1>Gas usage report - Run No. #<span>1091293479</span></h1>
<h3>Commit SHA: <span>cdf0d2</span> - Compared to d2ccbd</h3>
    <table>            
        <tr>
            <th>Contract</th>
            <th>Method</th>
            <th>Min</th>
            <th>Max</th>
            <th>Avg</th>
            <th>Avg. Diff.</th>
        </tr>                            
        <tr>                
            <td>TestContract</td>                
            <td>makeAnOffer</td>                 
            <td>105814</td>                
            <td>164886</td>                
            <td>135350</td>                
            <td>-</td>            
        </tr>                    
        <tr>                
            <td>TestContract</td>                
            <td>createSale</td>                 
            <td>117731</td>                
            <td>137219</td>                
            <td>127955</td>                
            <td>???? 10.12 %</td>            
        </tr>                    
        <tr>                
            <td>TestContract</td>                
            <td>createAuction</td>                 
            <td>140047</td>                
            <td>174487</td>                
            <td>150868</td>                
            <td>???? -20.10 %</td>            
        </tr>                    
    </table>
</div>