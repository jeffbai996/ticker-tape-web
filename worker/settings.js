import {makeCapDocHandler} from './capdoc.js'
import {validateSettingsDocument} from '../src/lib/preferences.js'
export const handleSettings=makeCapDocHandler({
 route:'/settings',keyPrefix:'settings:',validate:validateSettingsDocument,maxBody:48000,
})
