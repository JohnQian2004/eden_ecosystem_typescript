const fs = require('fs');
const path = require('path');

// Test workflow loading
console.log('🧪 Testing workflow loading...\n');

// Test AMC cinema workflow
try {
  const amcPath = path.join(__dirname, 'data', 'amc_cinema.json');
  console.log('📁 AMC cinema file path:', amcPath);

  if (fs.existsSync(amcPath)) {
    console.log('✅ AMC cinema file exists');
    const amcData = JSON.parse(fs.readFileSync(amcPath, 'utf8'));
    if (amcData.flowwiseWorkflow) {
      console.log('✅ AMC cinema has flowwiseWorkflow');
      console.log('📊 AMC workflow name:', amcData.flowwiseWorkflow.name);
      console.log('📊 AMC workflow steps:', amcData.flowwiseWorkflow.steps.length);
      console.log('📊 AMC first step:', amcData.flowwiseWorkflow.steps[0].name);
    } else {
      console.log('❌ AMC cinema missing flowwiseWorkflow');
    }
  } else {
    console.log('❌ AMC cinema file not found');
  }
} catch (error) {
  console.log('❌ AMC cinema error:', error.message);
}

console.log();

// Test DEX workflow
try {
  const dexPath = path.join(__dirname, 'data', 'dex.json');
  console.log('📁 DEX file path:', dexPath);

  if (fs.existsSync(dexPath)) {
    console.log('✅ DEX file exists');
    const dexData = JSON.parse(fs.readFileSync(dexPath, 'utf8'));
    if (dexData.flowwiseWorkflow) {
      console.log('✅ DEX has flowwiseWorkflow');
      console.log('📊 DEX workflow name:', dexData.flowwiseWorkflow.name);
      console.log('📊 DEX workflow steps:', dexData.flowwiseWorkflow.steps.length);
      console.log('📊 DEX first step:', dexData.flowwiseWorkflow.steps[0].name);
    } else {
      console.log('❌ DEX missing flowwiseWorkflow');
    }
  } else {
    console.log('❌ DEX file not found');
  }
} catch (error) {
  console.log('❌ DEX error:', error.message);
}

console.log('\n✅ Test completed');

