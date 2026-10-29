import {backtest} from './echo-model.js';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,stats:backtest(data.rows,data.now,data.min)});}catch{self.postMessage({id:data.id,error:true});}};
