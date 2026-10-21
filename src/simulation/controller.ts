import { commandForFlow, identityExample, type ControllerConfig } from '../control/controller';
/** The simulator uses exactly the same physical-pitch inference and transform as HTTP. */
export const simulationCommand = (flowLMin:number, config:ControllerConfig=identityExample) => commandForFlow(flowLMin,0,config);
