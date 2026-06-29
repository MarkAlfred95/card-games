const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Step 1: Load home page
  await page.goto('http://localhost:5199/');
  await page.waitForLoadState('networkidle');
  const title = await page.title();
  const homeContent = await page.content();
  const hasPokerCard = homeContent.includes("Texas Hold") || homeContent.includes("poker");
  console.log("STEP1_TITLE=" + title);
  console.log("STEP1_HAS_POKER=" + hasPokerCard);
  await page.screenshot({ path: 'C:/Users/l.babao/Documents/Github/card-games/verify-home.png' });

  // Step 2: Click the poker game card
  const pokerLink = page.locator('a[href*="poker"], button:has-text("Hold"), a:has-text("Hold")').first();
  const pokerLinkHref = await pokerLink.getAttribute('href').catch(() => null);
  console.log("STEP2_POKER_HREF=" + pokerLinkHref);
  await page.goto('http://localhost:5199/games/poker');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'C:/Users/l.babao/Documents/Github/card-games/verify-buyin.png' });
  const buyinContent = await page.content();
  const hasBuyin = buyinContent.includes("Sit Down") || buyinContent.includes("Buy-in") || buyinContent.includes("500");
  console.log("STEP2_HAS_BUYIN=" + hasBuyin);

  // Step 3: Set wallet balance high enough, then buy in
  // First check wallet state
  const walletText = await page.locator('text=$').first().textContent().catch(() => 'N/A');
  console.log("STEP3_WALLET_TEXT=" + walletText);
  
  // Click Sit Down
  const sitBtn = page.locator('button:has-text("Sit Down")');
  const sitBtnExists = await sitBtn.count();
  console.log("STEP3_SIT_BTN_EXISTS=" + sitBtnExists);
  if (sitBtnExists > 0) {
    await sitBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:/Users/l.babao/Documents/Github/card-games/verify-table.png' });
    const tableContent = await page.content();
    const hasDealBtn = tableContent.includes("Deal Hand");
    console.log("STEP3_HAS_DEAL_BTN=" + hasDealBtn);

    // Step 4: Deal a hand
    const dealBtn = page.locator('button:has-text("Deal")');
    if (await dealBtn.count() > 0) {
      await dealBtn.click();
      await page.waitForTimeout(3000); // wait for bots to act
      await page.screenshot({ path: 'C:/Users/l.babao/Documents/Github/card-games/verify-dealing.png' });
      const afterDeal = await page.content();
      const hasActionBtns = afterDeal.includes("Fold") || afterDeal.includes("Check") || afterDeal.includes("Call");
      const hasBotThinking = afterDeal.includes("thinking");
      console.log("STEP4_HAS_ACTION_BTNS=" + hasActionBtns);
      console.log("STEP4_BOT_THINKING=" + hasBotThinking);

      // Wait longer for human turn
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'C:/Users/l.babao/Documents/Github/card-games/verify-human-turn.png' });
      const humanTurnContent = await page.content();
      const humanActionBtns = humanTurnContent.includes("Fold") && humanTurnContent.includes("All In");
      console.log("STEP4_HUMAN_ACTION=" + humanActionBtns);
    }
  }

  // Check for console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  console.log("CONSOLE_ERRORS=" + errors.join("|"));

  await browser.close();
  console.log("DONE");
})();
