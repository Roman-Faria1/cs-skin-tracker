import { Inject, Injectable } from "@nestjs/common";
import type { AlertAction, AlertRuleInput } from "@csst/shared";
import { AlertsRepository } from "./alerts.repository.js";

@Injectable()
export class AlertsService {
  constructor(@Inject(AlertsRepository) private readonly repository: AlertsRepository) {}
  list() {
    return this.repository.list();
  }
  history(cursor?: string) {
    return this.repository.history(cursor);
  }
  save(input: AlertRuleInput, id?: string) {
    return this.repository.save(input, id);
  }
  action(id: string, action: AlertAction) {
    return this.repository.action(id, action);
  }
  remove(id: string) {
    return this.repository.remove(id);
  }
  evaluate() {
    return this.repository.evaluate();
  }
}
