(function(){
  const strategies={
    WORKDAY:{rowSelectors:['[data-automation-id*="workExperience"]','[data-automation-id*="education"]','[data-automation-id*="formField"]'],addButtons:['button[data-automation-id*="add"]','button[aria-label*="Add"]']},
    GREENHOUSE:{rowSelectors:['.field','.application-field','.form-group'],addButtons:['button','a.button']},
    LEVER:{rowSelectors:['.application-question','.application-field','.posting-requirements'],addButtons:['button','.add-another']},
    ASHBY:{rowSelectors:['[data-testid*="field"]','[data-testid*="experience"]','[data-testid*="education"]'],addButtons:['button[data-testid*="add"]','button']},
    CIPHR:{rowSelectors:['.form-group','.question','.field','.row','fieldset'],addButtons:['button','a']},
    GENERIC:{rowSelectors:['fieldset','.form-group','.question','.field','.control-group','.row','.panel','.card','section','div[class*=employment]','div[class*=education]'],addButtons:['button','a']}
  };
  function current(){const name=window.JobCopilotAdapterRegistry?.detect?.()||'GENERIC';return {name,strategy:strategies[name]||strategies.GENERIC}}
  window.JobCopilotRepeatedStrategies={strategies,current};
})();
