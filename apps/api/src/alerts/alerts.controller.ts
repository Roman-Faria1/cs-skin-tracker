import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query
} from "@nestjs/common";
import { alertActionSchema, alertRuleInputSchema } from "@csst/shared";
import { z } from "zod";
import { AlertsService } from "./alerts.service.js";

@Controller("alerts")
export class AlertsController {
  constructor(@Inject(AlertsService) private readonly alerts: AlertsService) {}
  @Get() list() {
    return this.alerts.list();
  }
  @Get("events") history(@Query("cursor") cursor?: string) {
    if (cursor !== undefined && cursor.length > 500)
      throw new BadRequestException("Invalid alert history cursor");
    return this.alerts.history(cursor);
  }
  @Post() create(@Body() body: unknown) {
    return this.alerts.save(parse(alertRuleInputSchema, body));
  }
  @Put(":id") update(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.alerts.save(parse(alertRuleInputSchema, body), id);
  }
  @Patch(":id") action(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.alerts.action(id, parse(alertActionSchema, body).action);
  }
  @Delete(":id") remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.alerts.remove(id);
  }
  @Post("evaluate") evaluate() {
    return this.alerts.evaluate();
  }
}

function parse<Output, Input>(
  schema: z.ZodType<Output, z.ZodTypeDef, Input>,
  body: unknown
): Output {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException(result.error.issues.map((issue) => issue.message).join("; "));
  return result.data;
}
