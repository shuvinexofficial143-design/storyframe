import type {ImageProvider} from "./types";
import {pollinationsImageProvider} from "./pollinations";

const providers:Record<string,ImageProvider>={
  pollinations:pollinationsImageProvider
};

export function getImageProvider(id="pollinations"){
  return providers[id]||pollinationsImageProvider;
}

export function listImageProviders(){
  return Object.values(providers).map((provider)=>({id:provider.id,name:provider.name,defaultModel:provider.defaultModel,capabilities:provider.capabilities}));
}
