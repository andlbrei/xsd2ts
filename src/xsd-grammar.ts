/**
 * Created by eddyspreeuwers on 12/18/19.
 */
import {attribs , capFirst} from './xml-utils';
import {
    ASTNode, Proxy, AstNodeFactory, Terminal, AstNodeMerger, astNode, match, oneOf, astClass, astField,
    astEnum, astEnumValue
} from './parsing';


const fieldHandler: AstNodeFactory = (n) => (attribs(n).type) ? astNode('Field').addField(n) : null;


const topFieldHandler: AstNodeFactory = (n) => /xs:/.test(attribs(n).type) ? astClass().addName(n, 'For').addFields(n) : null;

const attrHandler: AstNodeFactory = (n) =>  astNode('Field').addField(n);


const arrayFldHandler: AstNodeFactory = (n) => (attribs(n).type && attribs(n).maxOccurs === "unbounded") ? astNode('Field').addField(n) : null;


const cmpFldHandler: AstNodeFactory = (n) => astField().prop('fieldName', attribs(n).name).prop('fieldType', capFirst(attribs(n).name));

const classHandler: AstNodeFactory = (n) => (attribs(n).type) ? null : astClass(n);
const enumElmHandler: AstNodeFactory = (n) => (attribs(n).type) ? null : astEnum(n);
const enumerationHandler: AstNodeFactory = (n) => (attribs(n).value) ?  astEnumValue(n): null;
const extensionHandler: AstNodeFactory = (n) => astNode('Extesnsion').prop('extends', attribs(n).base);

const intRestrictionHandler: AstNodeFactory = (n) => /integer/.test(attribs(n).base) ?  astNode('AliasType').prop('value', 'number'): null;
const strRestrictionHandler: AstNodeFactory = (n) => /string/.test(attribs(n).base) ?  astNode('EnumType').prop('value', 'string'): null;


const namedGroupHandler: AstNodeFactory = (n) => (attribs(n).name) ?  astNode('Group').addName(n) : null;
const refGroupHandler: AstNodeFactory = (n) => (attribs(n).ref) ?  astNode('Fields').prop('ref', attribs(n).ref):null



const typesMerger: AstNodeMerger  = (r1, r2) => {r1.obj.types = r2.list; return r1; };
const fieldsMerger: AstNodeMerger  = (r1, r2) => {r1.obj.fields = r2.list; return r1; };
const enumMerger: AstNodeMerger = (r1, r2) => {r1.nodeType = 'Enumeration'; r1.obj.values = r2.list; return r1; };
const typeMerger: AstNodeMerger = (r1, r2) => {r1.nodeType = 'AliasType'; r1.obj.type = r2.obj.value; return r1; };

const nestedClassMerger: AstNodeMerger  = (r1, r2) => {r1.nodeType='Field';r1.obj.nestedClass= {name: r1.obj.fieldType, fields: r2.list}; return r1; };



export class XsdGrammar {

    public parse(node: Node): ASTNode {

        //Terminals
        const FIELDPROXY     = new Proxy('Field Proxy');
        const fieldElement   = new Terminal("element:fld", fieldHandler);
        const cmpFldElement  = new Terminal("element:comp", cmpFldHandler);
        const arrFldElement  = new Terminal("element:array", arrayFldHandler);
        const classElement   = new Terminal("element:class", classHandler);
        const topFldElement  = new Terminal("element:topFld", topFieldHandler);
        const enumElement    = new Terminal("element:enum", enumElmHandler);
        const attributeGroup = new Terminal("attributeGroup:attrGrp", namedGroupHandler);
        const schema         = new Terminal("schema");
        const namedGroup     = new Terminal("group:named", namedGroupHandler);
        const refGroup       = new Terminal("group:ref", refGroupHandler);
        const complexType    = new Terminal("complexType");
        const simpleType     = new Terminal("simpleType");
        const complexContent = new Terminal("complexContent");
        const extension      = new Terminal("extension",extensionHandler);

        const enumeration    = new Terminal("enumeration",enumerationHandler);

        const strRestriction = new Terminal("restriction", strRestrictionHandler);
        const intRestriciton = new Terminal("restriction", intRestrictionHandler);
        const classType      = new Terminal("complexType", classHandler);
        const attribute      = new Terminal("attribute", attrHandler);
        const sequence       = new Terminal("sequence");


        // NonTerminals

        const REFGROUP = match(refGroup);
        const ATTRIBUTE= match(attribute);
        const ARRFIELD = match(cmpFldElement).child(complexType).child(sequence).child(arrFldElement);

        const CMPFIELD = match(cmpFldElement, nestedClassMerger).child(complexType).child(sequence).children(FIELDPROXY);

        const FIELD    = oneOf(CMPFIELD, ARRFIELD,  match(fieldElement), REFGROUP ); FIELDPROXY.parslet = FIELD;

        const A_CLASS  = match(classElement).child(complexType).children(match(attribute));
        // element class
        const E_CLASS  = match(classElement).child(complexType).child(sequence, fieldsMerger).children(FIELD);

        // group class
        const G_CLASS  = match(attributeGroup).children(match(attribute));

        // coplex type class
        const SEQUENCE = match(sequence, fieldsMerger).children(FIELD);
        const CCONTENT = match(complexContent).child(extension).child(sequence, fieldsMerger).children(FIELD);

        const R_CLASS  = match(classType).children(REFGROUP, ATTRIBUTE);
        const C_CLASS  = match(classType).childIsOneOf(SEQUENCE, CCONTENT);

        //extended class
        const X_CLASS  = match(classType).child(complexContent).child(extension).child(sequence, fieldsMerger).children(FIELD);


        //const R_CLASS  = match(classType).child(refGroup);
        const S_CLASS  = match(classType); //simple empty class
        const F_CLASS  = match(topFldElement);
        const N_GROUP  = match(namedGroup).child(sequence, fieldsMerger).children(FIELD);
        const ENUMTYPE = match(enumElement, enumMerger).child(simpleType).child(strRestriction).children(match(enumeration));
        const ALIASTYPE= match(enumElement, typeMerger).child(simpleType).child(intRestriciton);
        const TYPES    = oneOf(ALIASTYPE, ENUMTYPE, E_CLASS, C_CLASS, X_CLASS, N_GROUP, F_CLASS, G_CLASS, A_CLASS, S_CLASS, R_CLASS );

        const SCHEMA   = match(schema, typesMerger).children(TYPES);
        const result   = SCHEMA.parse(node, '');
        return result;

    }

}



