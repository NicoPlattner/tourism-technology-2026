import {test,expect,type Page} from '@playwright/test';
import {mockDemand,forecastFixture} from './helpers/demand';
import {selectPeriod} from './helpers/travel';
async function age(page:Page,group:string){await page.getByRole('button',{name:/Target audience age/}).click();await page.getByRole('option',{name:group,exact:true}).click();}
test.beforeEach(async({page})=>{
 await mockDemand(page);
 await page.route('https://naechtigungen.pol.joanneum.at/**',r=>r.fulfill({json:{forecast_data:[]}}));
 await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{daily:{time:[]}}}));
});
test('switching audience hides old pixels until the new image loads; late downloads cannot replace the current image',async({page})=>{
 await page.goto('./');await expect(page.locator('.cp-social-image')).toBeVisible();
 const original=await page.locator('.cp-social-image').getAttribute('src');
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route(/winter-35-44[^/]*\.webp/,async route=>{await gate;await route.continue();});
 await age(page,'35–44');
 await expect(page.locator('.cp-image-placeholder')).toContainText('Loading campaign image');
 await expect(page.locator('.cp-social-image')).toBeHidden();
 expect(await page.locator('.cp-social-image').getAttribute('src')).not.toBe(original);
 await age(page,'45–60');
 await expect(page.locator('.cp-social-image')).toBeVisible();
 const current=await page.locator('.cp-social-image').getAttribute('src');
 release();await expect(page.locator('.cp-social-image')).toHaveAttribute('src',current!);
 await expect(page.locator('.cp-image-placeholder')).toHaveCount(0);
});
test('period changes show a placeholder while travel-window data is resolving, even if the asset has downloaded',async({page})=>{
 await page.goto('./');await expect(page.locator('.cp-social-image')).toBeVisible();
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/c04-api/forecast?**',async route=>{const p=new URL(route.request().url()).searchParams;if(p.get('start')==='2027-07-12')await gate;await route.fulfill({json:forecastFixture(p.get('start')!,p.get('end')!)});});
 await selectPeriod(page,'q3-2027');
 await expect(page.locator('.cp-image-placeholder')).toContainText('Preparing campaign image');
 await expect(page.locator('.cp-social-image')).toBeHidden();
 release();await expect(page.locator('.cp-social-image')).toBeVisible();
 await expect(page.locator('.cp-social-image')).toHaveAttribute('src',/summer-18-24/);
 await expect(page.locator('.cp-image-placeholder')).toHaveCount(0);
});
test('a failed image shows a useful retry state and can recover without showing the previous group',async({page})=>{
 let requests=0;
 await page.route(/winter-35-44[^/]*\.webp/,route=>++requests===1?route.fulfill({status:404,body:''}):route.continue());
 await page.goto('./');await expect(page.locator('.cp-social-image')).toBeVisible();
 await age(page,'35–44');
 await expect(page.getByRole('button',{name:'Retry image',exact:true})).toBeVisible();
 await expect(page.locator('.cp-social-image')).toBeHidden();
 await page.getByRole('button',{name:'Retry image',exact:true}).click();
 await expect(page.locator('.cp-social-image')).toBeVisible();expect(requests).toBe(2);
});

test('campaign creatives remain centered beside short and long captions at all layouts',async({page})=>{
 await page.goto('./');
 await expect(page.locator('.cp-social-image')).toBeVisible();
 for(const width of [1920,1440,951,950,768,390]){
  await page.setViewportSize({width,height:1000});
  for(const group of ['18–24','35–44','45–60']){
   await age(page,group);
   await expect(page.locator('.cp-social-image')).toBeVisible();
   const alignment=await page.locator('.cp-social-media').evaluate(container=>{
    const image=container.querySelector('img')!,outer=container.getBoundingClientRect(),inner=image.getBoundingClientRect();
    const style=getComputedStyle(image);
    return {dx:Math.abs((inner.left+inner.right-outer.left-outer.right)/2),dy:Math.abs((inner.top+inner.bottom-outer.top-outer.bottom)/2),fits:inner.width<=outer.width+1,fit:style.objectFit,position:style.objectPosition,backgroundMatches:style.backgroundColor===getComputedStyle(container).backgroundColor};
   });
   expect(alignment.dx).toBeLessThan(1);
   expect(alignment.dy).toBeLessThan(1);
   expect(alignment.fits).toBeTruthy();
   expect(alignment.fit).toBe('contain');
   expect(alignment.position).toBe('50% 50%');
   expect(alignment.backgroundMatches).toBeTruthy();
  }
 }
});
